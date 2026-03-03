const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

const PORT = Number(process.env.SILO_PORT || 4177);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOKEN_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map();

const DEFAULT_STORE = { voters: [], households: [], canvassInteractions: [], mapAnnotations: [], imports: [], auditEvents: [] };

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
}
function readStore() { ensureStore(); return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); }
function writeStore(store) { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function normalizeAddress(row) {
  return [row.address || row.address1 || row.street || row.residence_address, row.city, row.state, row.zip || row.zip_code || row.postal]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
}
function deterministicGeo(address) {
  const hash = crypto.createHash('sha256').update(address).digest();
  const a = hash.readUInt32BE(0) / 0xffffffff;
  const b = hash.readUInt32BE(4) / 0xffffffff;
  return { lat: Number((46.79 + a * (47.35 - 46.79)).toFixed(6)), lng: Number((-123.35 + b * (-122.02 + 123.35)).toFixed(6)), geocode_confidence: 0.5, geocode_source: 'deterministic-fallback' };
}
function audit(store, actor, action, targetType, targetId, metadata = {}) {
  store.auditEvents.unshift({ id: id('audit'), actor, action, targetType, targetId, timestamp: now(), metadata });
  store.auditEvents = store.auditEvents.slice(0, 10000);
}
function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 12 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function bearer(req) {
  const token = String(req.headers.authorization || '').replace('Bearer ', '').trim();
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}
function serveStatic(req, res) {
  const rel = req.url.replace('/app/', '') || 'index.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  const ctype = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
  res.writeHead(200, { 'Content-Type': ctype });
  fs.createReadStream(filePath).pipe(res);
}

async function handler(req, res) {
  if (req.url === '/health') return send(res, 200, { ok: true });
  if (req.url.startsWith('/app/')) return serveStatic(req, res);

  if (req.method === 'POST' && req.url === '/api/auth/login') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const pin = String(body.pin || '');
    const expected = process.env.SILO_ADMIN_PIN || 'change-me-now';
    if (pin !== expected) return send(res, 401, { error: 'Invalid PIN' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { userId: 'admin', role: 'admin', expiresAt: Date.now() + TOKEN_TTL_MS });
    return send(res, 200, { token, expiresInMs: TOKEN_TTL_MS });
  }

  if (!req.url.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  const user = bearer(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });

  if (req.method === 'GET' && req.url === '/api/dashboard') {
    const store = readStore();
    const countyCounts = store.voters.reduce((acc, v) => ((acc[v.source_county] = (acc[v.source_county] || 0) + 1), acc), {});
    return send(res, 200, { voters: store.voters.length, households: store.households.length, interactions: store.canvassInteractions.length, annotations: store.mapAnnotations.length, countyCounts });
  }

  if (req.method === 'POST' && req.url === '/api/imports/voters') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const county = String(body.county || '').toLowerCase().trim();
    if (!['pierce', 'thurston'].includes(county)) return send(res, 400, { error: 'County must be pierce or thurston' });
    if (!body.csv) return send(res, 400, { error: 'csv text required' });

    const rows = parse(String(body.csv), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
    const store = readStore();
    const importId = id('import');
    const report = { importId, county, accepted: 0, rejected: 0, rejectedRows: [] };
    const householdByAddress = new Map(store.households.map((h) => [h.normalized_address, h]));

    rows.forEach((row, idx) => {
      const normalized = normalizeAddress(row);
      if (!normalized) { report.rejected += 1; report.rejectedRows.push({ row: idx + 2, reason: 'Missing address' }); return; }
      let household = householdByAddress.get(normalized);
      if (!household) {
        const lat = Number(row.lat || row.latitude), lng = Number(row.lng || row.longitude || row.lon);
        const geo = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, geocode_confidence: 1, geocode_source: 'csv' } : deterministicGeo(normalized);
        household = { household_id: id('hh'), normalized_address: normalized, lat: geo.lat, lng: geo.lng, geocode_confidence: geo.geocode_confidence, geocode_source: geo.geocode_source, created_at: now() };
        householdByAddress.set(normalized, household);
        store.households.push(household);
      }
      const voterId = row.voter_id || row.voterid || row.state_voter_id || id('voter');
      if (store.voters.some((v) => v.voter_id === String(voterId) && v.source_county === county)) { report.rejected += 1; report.rejectedRows.push({ row: idx + 2, reason: 'Duplicate voter_id in county' }); return; }
      store.voters.push({ voter_id: String(voterId), first_name: row.first_name || row.firstname || row.first || '', last_name: row.last_name || row.lastname || row.last || '', party: row.party || row.registered_party || row.party_code || 'Unknown', precinct: row.precinct || '', source_county: county, source_file_id: importId, household_id: household.household_id, created_at: now() });
      report.accepted += 1;
    });

    store.imports.unshift({ import_id: importId, county, uploaded_by: user.userId, uploaded_at: now(), status: 'completed', accepted_rows: report.accepted, rejected_rows: report.rejected, rejected_detail: report.rejectedRows });
    audit(store, user.userId, 'IMPORT_VOTERS', 'import', importId, { county, accepted: report.accepted, rejected: report.rejected });
    writeStore(store);
    return send(res, 200, report);
  }

  if (req.method === 'GET' && req.url.startsWith('/api/map/features')) {
    const county = new URL(req.url, 'http://localhost').searchParams.get('county') || 'all';
    const store = readStore();
    const eligible = new Set(county === 'all' ? store.households.map((h) => h.household_id) : store.voters.filter((v) => v.source_county === county).map((v) => v.household_id));
    const households = store.households.filter((h) => eligible.has(h.household_id)).map((h) => {
      const voters = store.voters.filter((v) => v.household_id === h.household_id);
      const last = store.canvassInteractions.find((i) => i.household_id === h.household_id);
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [h.lng, h.lat] }, properties: { household_id: h.household_id, normalized_address: h.normalized_address, voter_count: voters.length, voters, status: last?.outcome || 'Not Attempted' } };
    });
    const annotations = store.mapAnnotations.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: a }));
    return send(res, 200, { households: { type: 'FeatureCollection', features: households }, annotations: { type: 'FeatureCollection', features: annotations } });
  }

  if (req.method === 'POST' && req.url === '/api/canvass/logs') {
    const body = await parseBody(req).catch(() => null); if (!body) return send(res, 400, { error: 'Invalid JSON' });
    if (!body.household_id || !body.outcome) return send(res, 400, { error: 'household_id and outcome are required' });
    const store = readStore();
    const record = { interaction_id: id('int'), household_id: body.household_id, voter_id: body.voter_id || null, outcome: body.outcome, notes: body.notes || '', next_followup_at: body.next_followup_at || null, created_by: user.userId, created_at: now() };
    store.canvassInteractions.unshift(record); audit(store, user.userId, 'CANVASS_LOG', 'household', body.household_id, { outcome: body.outcome }); writeStore(store);
    return send(res, 200, record);
  }

  if (req.method === 'POST' && req.url === '/api/annotations') {
    const body = await parseBody(req).catch(() => null); if (!body) return send(res, 400, { error: 'Invalid JSON' });
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) return send(res, 400, { error: 'lat/lng required' });
    const store = readStore();
    const record = { annotation_id: id('ann'), lat: body.lat, lng: body.lng, type: body.type || 'note', note: body.note || '', followup_at: body.followup_at || null, created_by: user.userId, created_at: now() };
    store.mapAnnotations.unshift(record); audit(store, user.userId, 'ADD_ANNOTATION', 'annotation', record.annotation_id, { type: record.type }); writeStore(store);
    return send(res, 200, record);
  }

  if (req.method === 'GET' && req.url === '/api/imports') return send(res, 200, readStore().imports.slice(0, 50));
  if (req.method === 'GET' && req.url === '/api/audit') return send(res, 200, readStore().auditEvents.slice(0, 200));
  return send(res, 404, { error: 'Not found' });
}

function createServer() { ensureStore(); return http.createServer((req, res) => handler(req, res).catch((e) => send(res, 500, { error: e.message }))); }

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Voter mapping silo running at http://localhost:${PORT}/app/`));
}

module.exports = { createServer, ensureStore, STORE_PATH };

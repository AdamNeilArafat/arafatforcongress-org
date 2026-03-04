const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

const PORT = Number(process.env.SILO_PORT || 4177);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LIVE_PUBLIC_METRICS_PATH = path.join(__dirname, '..', '..', 'data', 'public-metrics.json');
const LIVE_OUTREACH_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'outreach_data.json');
const LIVE_VOLUNTEER_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'volunteer_data.json');

const TOKEN_TTL_MS = Number(process.env.SILO_TOKEN_TTL_MS || 12 * 60 * 60 * 1000);
const sessions = new Map();

const DEFAULT_STORE = { voters: [], households: [], canvassInteractions: [], mapAnnotations: [], imports: [], auditEvents: [], settings: {} };

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
}
function readStore() {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {};
  return parsed;
}
function writeStore(store) { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function normalizeAddress(row) {
  const registrationStreet = [
    row.regstpredirection,
    row.regstnum,
    row.regstfrac,
    row.regstname,
    row.regsttype,
    row.regstpostdirection,
    row.regunittype,
    row.regstunitnum
  ].filter(Boolean).join(' ');
  const mailingStreet = [row.mail1, row.mail2, row.mail3].filter(Boolean).join(' ');

  return [
    row.address || row.address1 || row.street || row.residence_address || row.full_address || row['full address'] || registrationStreet || mailingStreet,
    row.city || row.town || row.regcity || row.mailcity,
    row.state || row.regstate || row.mailstate,
    row.zip || row.zip_code || row.postal || row['zip code'] || row.regzipcode || row.mailzip
  ]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
}
function normalizeKey(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function normalizeRow(row = {}) {
  return Object.entries(row).reduce((acc, [key, value]) => {
    const normalized = normalizeKey(key);
    if (normalized) acc[normalized] = value;
    return acc;
  }, {});
}
function firstNonEmpty(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return fallback;
}
function splitName(fullName = '') {
  const normalized = String(fullName).trim().replace(/\s+/g, ' ');
  if (!normalized) return { firstName: '', lastName: '' };
  const parts = normalized.split(' ');
  return { firstName: parts.shift() || '', lastName: parts.join(' ') || '' };
}
function deterministicGeo(address) {
  const hash = crypto.createHash('sha256').update(address).digest();
  const a = hash.readUInt32BE(0) / 0xffffffff;
  const b = hash.readUInt32BE(4) / 0xffffffff;
  return { lat: Number((46.79 + a * (47.35 - 46.79)).toFixed(6)), lng: Number((-123.35 + b * (-122.02 + 123.35)).toFixed(6)), geocode_confidence: 0.5, geocode_source: 'deterministic-fallback' };
}
function importVotersFromCsv({ store, county, csvText, actor, sourceLabel = 'manual-upload' }) {
  const rows = parse(String(csvText), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  const importId = id('import');
  const report = { importId, county, accepted: 0, rejected: 0, rejectedRows: [] };
  const householdByAddress = new Map(store.households.map((h) => [h.normalized_address, h]));

  rows.forEach((rawRow, idx) => {
    const row = normalizeRow(rawRow);
    const normalized = normalizeAddress(row);
    if (!normalized) {
      report.rejected += 1;
      report.rejectedRows.push({ row: idx + 2, reason: 'Missing address' });
      return;
    }
    let household = householdByAddress.get(normalized);
    if (!household) {
      const lat = Number(row.lat || row.latitude);
      const lng = Number(row.lng || row.longitude || row.lon);
      const geo = Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng, geocode_confidence: 1, geocode_source: 'csv' }
        : deterministicGeo(normalized);
      household = {
        household_id: id('hh'),
        normalized_address: normalized,
        lat: geo.lat,
        lng: geo.lng,
        geocode_confidence: geo.geocode_confidence,
        geocode_source: geo.geocode_source,
        created_at: now()
      };
      householdByAddress.set(normalized, household);
      store.households.push(household);
    }
    const voterId = firstNonEmpty(row, ['voter_id', 'voterid', 'state_voter_id', 'statevoterid', 'voter id'], id('voter'));
    if (store.voters.some((v) => v.voter_id === String(voterId) && v.source_county === county)) {
      report.rejected += 1;
      report.rejectedRows.push({ row: idx + 2, reason: 'Duplicate voter_id in county' });
      return;
    }
    const rawFirst = firstNonEmpty(row, ['first_name', 'firstname', 'first', 'first name']);
    const rawLast = firstNonEmpty(row, ['last_name', 'lastname', 'last', 'last name']);
    const parsedFromFullName = splitName(firstNonEmpty(row, ['name', 'full_name', 'full name', 'voter_name']));
    store.voters.push({
      voter_id: String(voterId),
      first_name: rawFirst || parsedFromFullName.firstName,
      last_name: rawLast || parsedFromFullName.lastName,
      age: firstNonEmpty(row, ['age']),
      birth_year: firstNonEmpty(row, ['birth_year', 'birthyear', 'birth year', 'year_of_birth', 'yob']),
      last_voted: firstNonEmpty(row, ['last_voted', 'lastvoted', 'last voted', 'when_voted', 'when voted', 'voted_date']),
      party: firstNonEmpty(row, ['party', 'registered_party', 'party_code'], 'Unknown'),
      precinct: firstNonEmpty(row, ['precinct', 'precinctcode', 'precinct_code']),
      source_county: county,
      source_file_id: importId,
      created_from: sourceLabel,
      household_id: household.household_id,
      created_at: now()
    });
    report.accepted += 1;
  });

  store.imports.unshift({
    import_id: importId,
    county,
    uploaded_by: actor,
    uploaded_at: now(),
    status: 'completed',
    accepted_rows: report.accepted,
    rejected_rows: report.rejected,
    source: sourceLabel,
    rejected_detail: report.rejectedRows
  });
  audit(store, actor, 'IMPORT_VOTERS', 'import', importId, {
    county,
    accepted: report.accepted,
    rejected: report.rejected,
    source: sourceLabel
  });

  return report;
}
function audit(store, actor, action, targetType, targetId, metadata = {}) {
  store.auditEvents.unshift({ id: id('audit'), actor, action, targetType, targetId, timestamp: now(), metadata });
  store.auditEvents = store.auditEvents.slice(0, 10000);
}
function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(payload));
}
function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}
function isoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function dashboardDataQuality(store) {
  const householdsWithDeterministicGeo = store.households.filter((h) => h.geocode_source === 'deterministic-fallback').length;
  const interactionsWithoutNotes = store.canvassInteractions.filter((i) => !String(i.notes || '').trim()).length;
  const newestImport = store.imports[0] || null;
  return {
    deterministicGeocodes: householdsWithDeterministicGeo,
    csvGeocodes: Math.max(0, store.households.length - householdsWithDeterministicGeo),
    interactionNoteCoveragePct: store.canvassInteractions.length
      ? Number((((store.canvassInteractions.length - interactionsWithoutNotes) / store.canvassInteractions.length) * 100).toFixed(1))
      : null,
    latestImportAt: newestImport?.uploaded_at || null,
    latestImportCounty: newestImport?.county || null,
    latestImportRejectRatePct: newestImport
      ? Number(((newestImport.rejected_rows / Math.max(1, newestImport.accepted_rows + newestImport.rejected_rows)) * 100).toFixed(1))
      : null
  };
}
function liveFeedSummary() {
  const publicMetrics = readJsonSafe(LIVE_PUBLIC_METRICS_PATH, {});
  const outreachData = readJsonSafe(LIVE_OUTREACH_DATA_PATH, {});
  const metrics = publicMetrics?.metrics || {};
  const outreachMeta = outreachData?.meta || {};
  return {
    source: 'campaign-live-feed',
    publicMetrics: {
      volunteersOnboarded: Number(metrics.volunteersOnboarded || 0),
      doorsKnocked: Number(metrics.doorsKnocked || 0),
      callsMade: Number(metrics.callsMade || 0),
      textsSent: Number(metrics.textsSent || 0),
      townHallsHeld: Number(metrics.townHallsHeld || 0),
      lastUpdated: isoOrNull(publicMetrics?.lastUpdated),
      methodology: publicMetrics?.methodology || null
    },
    outreachData: {
      totalOutreachContacts: Number(outreachMeta.total_outreach_contacts || outreachData?.total_outreach_contacts || 0),
      totalRecords: Number(outreachMeta.total_records || outreachData?.total_records || 0),
      dataPullDate: isoOrNull(outreachMeta.data_pull_date || outreachData?.data_pull_date),
      stale: Boolean(outreachMeta.stale ?? outreachData?.stale),
      staleReason: outreachMeta.stale_reason || outreachData?.stale_reason || null
    }
  };
}
function volunteerDashboardBridge() {
  const volunteerData = readJsonSafe(LIVE_VOLUNTEER_DATA_PATH, {});
  const meta = volunteerData?.meta || {};
  return {
    source: 'volunteer-dashboard-sync',
    adminPath: '/admin/volunteer-dashboard.html',
    totalVolunteers: Number(meta.total_volunteers || 0),
    activeVolunteers: Number(meta.active_volunteers || 0),
    stale: Boolean(meta.stale),
    dataPullDate: isoOrNull(meta.data_pull_date),
    skillsBreakdown: meta.skills_breakdown && typeof meta.skills_breakdown === 'object' ? meta.skills_breakdown : {}
  };
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
function secretHash(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}
function configuredAuthSecrets(store) {
  const candidates = [];
  const configuredHash = store.settings?.adminSecretHash || store.settings?.adminPinHash;
  const envSecret = process.env.SILO_ADMIN_SECRET || process.env.ADMIN_SECRET || process.env.SILO_ADMIN_PIN || process.env.ADMIN_PIN || process.env.ARAFAT_DASH_PIN;
  if (configuredHash) candidates.push({ hash: configuredHash, source: 'store' });
  if (envSecret) candidates.push({ hash: secretHash(envSecret), source: 'env' });
  return candidates;
}
function appRelativePath(pathname) {
  if (pathname === '/' || pathname === '/app' || pathname === '/app/') return 'index.html';
  const appIndex = pathname.indexOf('/app/');
  if (appIndex === -1) return null;
  const rel = pathname.slice(appIndex + '/app/'.length);
  return rel || 'index.html';
}
function serveStatic(req, res, pathname) {
  const rel = appRelativePath(pathname);
  if (!rel) return false;
  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return true; }
  const ext = path.extname(filePath);
  const ctype = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';
  res.writeHead(200, { 'Content-Type': ctype });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function handler(req, res) {
  const { pathname: rawPathname } = new URL(req.url, 'http://localhost');
  const pathname = rawPathname === '/silo' ? '/' : (rawPathname.startsWith('/silo/') ? rawPathname.slice('/silo'.length) : rawPathname);
  if (pathname === '/health') return send(res, 200, { ok: true });
  if (serveStatic(req, res, pathname)) return;

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const accessKey = String(body.accessKey || body.pin || '').trim();
    const store = readStore();
    const expectedSecrets = configuredAuthSecrets(store);
    if (!expectedSecrets.length) return send(res, 503, { error: 'Dashboard access key is not configured on the server.' });
    const matched = expectedSecrets.find((candidate) => secretHash(accessKey) === candidate.hash);
    if (!matched) return send(res, 401, { error: 'Invalid access key' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { userId: 'admin', role: 'admin', expiresAt: Date.now() + TOKEN_TTL_MS });
    return send(res, 200, { token, expiresInMs: TOKEN_TTL_MS, authSource: matched.source });
  }

  if (!pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (req.method === 'GET' && pathname === '/api/health') {
    const store = readStore();
    return send(res, 200, {
      ok: true,
      service: 'voter-mapping-silo',
      timestamp: now(),
      counts: {
        households: store.households.length,
        voters: store.voters.length,
        imports: store.imports.length,
        annotations: store.mapAnnotations.length,
        canvassInteractions: store.canvassInteractions.length
      }
    });
  }

  const user = bearer(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const store = readStore();
    const countyCounts = store.voters.reduce((acc, v) => ((acc[v.source_county] = (acc[v.source_county] || 0) + 1), acc), {});
    const outcomeCounts = store.canvassInteractions.reduce((acc, i) => ((acc[i.outcome] = (acc[i.outcome] || 0) + 1), acc), {});
    return send(res, 200, {
      voters: store.voters.length,
      households: store.households.length,
      interactions: store.canvassInteractions.length,
      annotations: store.mapAnnotations.length,
      countyCounts,
      outcomeCounts,
      dataQuality: dashboardDataQuality(store),
      liveFeed: liveFeedSummary(),
      volunteerDashboard: volunteerDashboardBridge(),
      settings: {
        accessKeyConfiguredInStore: Boolean(store.settings?.adminSecretHash || store.settings?.adminPinHash)
      }
    });
  }

  if (req.method === 'POST' && pathname === '/api/imports/voters') {
    const body = await parseBody(req).catch(() => null);
    if (!body) return send(res, 400, { error: 'Invalid JSON' });
    const county = String(body.county || '').toLowerCase().trim();
    if (!['pierce', 'thurston'].includes(county)) return send(res, 400, { error: 'County must be pierce or thurston' });
    if (!body.csv) return send(res, 400, { error: 'csv text required' });

    const store = readStore();
    const report = importVotersFromCsv({
      store,
      county,
      csvText: body.csv,
      actor: user.userId,
      sourceLabel: 'manual-upload'
    });
    writeStore(store);
    return send(res, 200, report);
  }

  if (req.method === 'POST' && pathname === '/api/imports/voters/remote') {
    const body = await parseBody(req).catch(() => null);
    if (!body || !Array.isArray(body.files) || !body.files.length) {
      return send(res, 400, { error: 'files[] is required' });
    }
    const store = readStore();
    const results = [];

    for (const file of body.files.slice(0, 12)) {
      const county = String(file.county || '').toLowerCase().trim();
      const url = String(file.url || '').trim();
      const label = String(file.label || url || `${county}-remote`).trim();
      if (!['pierce', 'thurston'].includes(county) || !url) {
        results.push({ label, county, url, error: 'Each file needs a valid county (pierce/thurston) and URL' });
        continue;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        const report = importVotersFromCsv({
          store,
          county,
          csvText,
          actor: user.userId,
          sourceLabel: `remote-url:${label}`
        });
        results.push({ label, county, url, ...report });
      } catch (error) {
        results.push({ label, county, url, error: `Unable to fetch/parse CSV: ${error.message}` });
      }
    }

    writeStore(store);
    const totals = results.reduce((acc, item) => {
      acc.accepted += Number(item.accepted || 0);
      acc.rejected += Number(item.rejected || 0);
      if (item.error) acc.failed += 1;
      return acc;
    }, { accepted: 0, rejected: 0, failed: 0 });

    return send(res, 200, { ok: true, totals, results });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/map/features')) {
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

  if (req.method === 'POST' && pathname === '/api/canvass/logs') {
    const body = await parseBody(req).catch(() => null); if (!body) return send(res, 400, { error: 'Invalid JSON' });
    if (!body.household_id || !body.outcome) return send(res, 400, { error: 'household_id and outcome are required' });
    const store = readStore();
    const record = { interaction_id: id('int'), household_id: body.household_id, voter_id: body.voter_id || null, outcome: body.outcome, notes: body.notes || '', next_followup_at: body.next_followup_at || null, created_by: 'dashboard', created_at: now() };
    store.canvassInteractions.unshift(record); audit(store, 'dashboard', 'CANVASS_LOG', 'household', body.household_id, { outcome: body.outcome }); writeStore(store);
    return send(res, 200, record);
  }

  if (req.method === 'POST' && pathname === '/api/annotations') {
    const body = await parseBody(req).catch(() => null); if (!body) return send(res, 400, { error: 'Invalid JSON' });
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) return send(res, 400, { error: 'lat/lng required' });
    const store = readStore();
    const record = { annotation_id: id('ann'), lat: body.lat, lng: body.lng, type: body.type || 'note', note: body.note || '', followup_at: body.followup_at || null, created_by: 'dashboard', created_at: now() };
    store.mapAnnotations.unshift(record); audit(store, 'dashboard', 'ADD_ANNOTATION', 'annotation', record.annotation_id, { type: record.type }); writeStore(store);
    return send(res, 200, record);
  }

  if (req.method === 'GET' && pathname === '/api/imports') return send(res, 200, readStore().imports.slice(0, 50));
  if (req.method === 'GET' && pathname === '/api/audit') return send(res, 200, readStore().auditEvents.slice(0, 200));
  return send(res, 404, { error: 'Not found' });
}

function createServer() { ensureStore(); return http.createServer((req, res) => handler(req, res).catch((e) => send(res, 500, { error: e.message }))); }

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Voter mapping silo running at http://localhost:${PORT}/app/`));
}

module.exports = { createServer, ensureStore, STORE_PATH };

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { parse } = require('csv-parse');

const PORT = Number(process.env.SILO_PORT || 4177);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LIVE_PUBLIC_METRICS_PATH = path.join(__dirname, '..', '..', 'data', 'public-metrics.json');
const LIVE_OUTREACH_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'outreach_data.json');
const LIVE_VOLUNTEER_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'volunteer_data.json');

const TOKEN_TTL_MS = Number(process.env.SILO_TOKEN_TTL_MS || 12 * 60 * 60 * 1000);
const MAX_JSON_BODY_BYTES = Number(process.env.SILO_MAX_JSON_BODY_BYTES || 80 * 1024 * 1024);
const MAX_UPLOAD_BODY_BYTES = Number(process.env.SILO_MAX_UPLOAD_BODY_BYTES || 200 * 1024 * 1024);
const IMPORT_BATCH_SIZE = Math.max(5000, Math.min(20000, Number(process.env.SILO_IMPORT_BATCH_SIZE || 5000)));
const IMPORT_FILES_DIR = path.join(DATA_DIR, 'imports');
const sessions = new Map();
const sseClients = new Set();
let eventVersion = 0;
const CLEAR_DATASETS_CONFIRMATION_KEYWORD = 'CLEAR_DATASETS';
const DELETE_VOTER_CONFIRMATION_KEYWORD = 'DELETE_VOTER';

const DEFAULT_STORE = {
  voters: [],
  households: [],
  canvassInteractions: [],
  mapAnnotations: [],
  imports: [],
  turfAssignments: [],
  turfs: [],
  callQueue: [],
  textQueue: [],
  queueEvents: [],
  optOutLocks: [],
  users: [],
  auditEvents: [],
  settings: {}
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMPORT_FILES_DIR)) fs.mkdirSync(IMPORT_FILES_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
}
function readStore() {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  if (!Array.isArray(parsed.voters)) parsed.voters = [];
  if (!Array.isArray(parsed.households)) parsed.households = [];
  if (!Array.isArray(parsed.canvassInteractions)) parsed.canvassInteractions = [];
  if (!Array.isArray(parsed.mapAnnotations)) parsed.mapAnnotations = [];
  if (!Array.isArray(parsed.imports)) parsed.imports = [];
  if (!Array.isArray(parsed.turfs)) parsed.turfs = [];
  if (!Array.isArray(parsed.callQueue)) parsed.callQueue = [];
  if (!Array.isArray(parsed.textQueue)) parsed.textQueue = [];
  if (!Array.isArray(parsed.queueEvents)) parsed.queueEvents = [];
  if (!Array.isArray(parsed.optOutLocks)) parsed.optOutLocks = [];
  if (!Array.isArray(parsed.auditEvents)) parsed.auditEvents = [];
  if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {};
  parsed.voters.forEach(withSoftDeleteDefaults);
  parsed.households.forEach(withSoftDeleteDefaults);
  parsed.canvassInteractions.forEach(withSoftDeleteDefaults);
  return parsed;
}
function writeStore(store) { fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function isSoftDeleted(record) {
  return Boolean(record && record.deleted_at);
}
function visibleRecords(records = [], includeDeleted = false) {
  return includeDeleted ? records : records.filter((record) => !isSoftDeleted(record));
}
function requireConfirmationKeyword(payload, expectedKeyword) {
  const typedKeyword = String(payload?.typedKeyword || payload?.confirmation || '').trim();
  if (!typedKeyword) return { ok: false, message: 'typedKeyword is required for this destructive action' };
  if (typedKeyword !== expectedKeyword) return { ok: false, message: `typedKeyword must exactly match ${expectedKeyword}` };
  return { ok: true, typedKeyword };
}
function softDeleteRecord(record, actor, reason = '') {
  record.deleted_at = now();
  record.deleted_by = actor;
  record.delete_reason = String(reason || '').trim();
}
function restoreRecord(record) {
  delete record.deleted_at;
  delete record.deleted_by;
  delete record.delete_reason;
}
function withSoftDeleteDefaults(record) {
  if (!record || typeof record !== 'object') return record;
  if (!Object.prototype.hasOwnProperty.call(record, 'deleted_at')) record.deleted_at = null;
  if (!Object.prototype.hasOwnProperty.call(record, 'deleted_by')) record.deleted_by = null;
  if (!Object.prototype.hasOwnProperty.call(record, 'delete_reason')) record.delete_reason = null;
  return record;
}
function latestInteractionByHousehold(interactions = []) {
  const latestByHousehold = new Map();
  for (const interaction of interactions) {
    if (!interaction?.household_id) continue;
    const existing = latestByHousehold.get(interaction.household_id);
    if (!existing) {
      latestByHousehold.set(interaction.household_id, interaction);
      continue;
    }
    const existingTimestamp = Date.parse(existing.created_at || 0);
    const candidateTimestamp = Date.parse(interaction.created_at || 0);
    if (candidateTimestamp >= existingTimestamp) {
      latestByHousehold.set(interaction.household_id, interaction);
    }
  }
  return latestByHousehold;
}
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
function updateImport(importId, updater) {
  const store = readStore();
  const target = store.imports.find((item) => item.import_id === importId);
  if (!target) return null;
  updater(target, store);
  writeStore(store);
  publishServerEvent('import.progress', {
    importId,
    status: target.status,
    phaseStartedAt: target.phase_started_at || null,
    progressPct: Number(target.progress_pct || 0),
    processedRows: Number(target.processed_rows || 0),
    acceptedRows: Number(target.accepted_rows || 0),
    rejectedRows: Number(target.rejected_rows || 0),
    county: target.county || null
  });
  if (target.status === 'geocoding') {
    publishServerEvent('import.geocode_update', {
      importId,
      county: target.county || null,
      processedRows: Number(target.processed_rows || 0),
      acceptedRows: Number(target.accepted_rows || 0),
      progressPct: Number(target.progress_pct || 0)
    });
  }
  return target;
}

function publishServerEvent(type, payload = {}) {
  eventVersion += 1;
  const event = {
    type,
    version: eventVersion,
    timestamp: now(),
    payload
  };
  const wire = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(wire);
    } catch (_) {
      sseClients.delete(client);
    }
  }
  return event;
}
function extractMultipartFile(bodyBuffer, contentType) {
  const boundaryMatch = String(contentType || '').match(/boundary=([^;]+)/i);
  if (!boundaryMatch) throw new Error('Missing multipart boundary');
  const boundary = boundaryMatch[1].trim();
  const bodyText = bodyBuffer.toString('latin1');
  const parts = bodyText.split(`--${boundary}`);
  const fields = {};
  let filePart = null;

  for (const rawPart of parts) {
    if (!rawPart || rawPart === '--' || rawPart === '--\r\n') continue;
    const part = rawPart.startsWith('\r\n') ? rawPart.slice(2) : rawPart;
    const splitAt = part.indexOf('\r\n\r\n');
    if (splitAt === -1) continue;
    const headerBlock = part.slice(0, splitAt);
    let valueBlock = part.slice(splitAt + 4);
    valueBlock = valueBlock.replace(/\r\n$/, '').replace(/--$/, '');
    const nameMatch = headerBlock.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const filenameMatch = headerBlock.match(/filename="([^"]*)"/i);
    if (filenameMatch) {
      const partStart = bodyText.indexOf(part);
      const contentStart = partStart + splitAt + 4;
      const binaryLength = Buffer.from(valueBlock, 'latin1').length;
      filePart = {
        fieldName,
        filename: filenameMatch[1],
        mimeType: (headerBlock.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1] || 'text/csv',
        buffer: bodyBuffer.subarray(contentStart, contentStart + binaryLength)
      };
      continue;
    }
    fields[fieldName] = valueBlock.trim();
  }

  if (!filePart) throw new Error('Multipart upload missing file');
  return { fields, file: filePart };
}
function parseUploadBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BODY_BYTES) {
        reject(new Error('Upload payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function processImportFile(importId) {
  updateImport(importId, (record) => {
    record.status = 'parsing';
    record.phase_started_at = now();
  });

  const store = readStore();
  const record = store.imports.find((item) => item.import_id === importId);
  if (!record) return;
  const county = record.county;
  const sourceLabel = record.source || 'manual-upload';
  const actor = record.uploaded_by || 'system';
  const householdByNormalizedAddress = new Map(store.households.map((h) => [h.normalized_address, h]));
  const existingVoterByCountyKey = new Map(store.voters.map((v) => [`${v.source_county}:${v.voter_id}`, v]));
  const voterByHousehold = new Map();
  for (const voter of store.voters) {
    voterByHousehold.set(voter.household_id, (voterByHousehold.get(voter.household_id) || 0) + 1);
  }
  const rejectedRows = [];
  let accepted = 0;
  let rejected = 0;
  let totalRows = 0;
  let batch = [];

  const flushBatch = () => {
    for (const item of batch) {
      const rawRow = item.rawRow;
      const rowNumber = item.rowNumber;
      const row = normalizeRow(rawRow);
      const normalized = normalizeAddress(row);
      if (!normalized) {
        rejected += 1;
        if (rejectedRows.length < 200) rejectedRows.push({ row: rowNumber, reason: 'Missing address' });
        continue;
      }
      let household = householdByNormalizedAddress.get(normalized);
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
          created_at: now(),
          deleted_at: null,
          deleted_by: null,
          delete_reason: null
        };
        householdByNormalizedAddress.set(normalized, household);
        store.households.push(household);
      }
      const voterId = String(firstNonEmpty(row, ['voter_id', 'voterid', 'state_voter_id', 'statevoterid', 'voter id'], id('voter')));
      const voterKey = `${county}:${voterId}`;
      if (existingVoterByCountyKey.has(voterKey)) {
        rejected += 1;
        if (rejectedRows.length < 200) rejectedRows.push({ row: rowNumber, reason: 'Duplicate voter_id in county' });
        continue;
      }
      existingVoterByCountyKey.set(voterKey, true);
      const rawFirst = firstNonEmpty(row, ['first_name', 'firstname', 'first', 'first name']);
      const rawLast = firstNonEmpty(row, ['last_name', 'lastname', 'last', 'last name']);
      const parsedFromFullName = splitName(firstNonEmpty(row, ['name', 'full_name', 'full name', 'voter_name']));
      const newVoter = {
        voter_id: voterId,
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
        created_at: now(),
        deleted_at: null,
        deleted_by: null,
        delete_reason: null
      };
      store.voters.push(newVoter);
      voterByHousehold.set(household.household_id, (voterByHousehold.get(household.household_id) || 0) + 1);
      accepted += 1;
    }
    batch = [];

    updateImport(importId, (current) => {
      current.processed_rows = totalRows;
      current.accepted_rows = accepted;
      current.rejected_rows = rejected;
      current.progress_pct = Number(((totalRows / Math.max(1, current.estimated_rows || totalRows || 1)) * 100).toFixed(1));
    });
  };

  try {
    const parser = parse({ columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
    const stream = fs.createReadStream(record.file_path).pipe(parser);
    for await (const row of stream) {
      totalRows += 1;
      batch.push({ rawRow: row, rowNumber: totalRows + 1 });
      if (batch.length >= IMPORT_BATCH_SIZE) {
        updateImport(importId, (current) => { current.status = 'deduping'; });
        flushBatch();
        updateImport(importId, (current) => { current.status = 'geocoding'; });
      }
    }
    if (batch.length) flushBatch();
    audit(store, actor, 'IMPORT_VOTERS', 'import', importId, { county, accepted, rejected, source: sourceLabel });
    const completedAt = now();
    const finalRecord = store.imports.find((item) => item.import_id === importId);
    if (finalRecord) {
      finalRecord.status = 'completed';
      finalRecord.completed_at = completedAt;
      finalRecord.accepted_rows = accepted;
      finalRecord.rejected_rows = rejected;
      finalRecord.processed_rows = totalRows;
      finalRecord.progress_pct = 100;
      finalRecord.rejected_detail = rejectedRows;
    }
    writeStore(store);
    publishServerEvent('import.progress', {
      importId,
      status: 'completed',
      phaseStartedAt: finalRecord?.phase_started_at || null,
      progressPct: 100,
      processedRows: totalRows,
      acceptedRows: accepted,
      rejectedRows: rejected,
      county
    });
  } catch (error) {
    updateImport(importId, (current) => {
      current.status = 'failed';
      current.error = error.message;
      current.completed_at = now();
    });
  }
}

function sanitizeActBlueUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}
function normalizePhone(value = '') {
  return String(value || '').replace(/[^0-9+]/g, '');
}
function optOutKey(channel, recipient) {
  return `${channel}:${recipient}`;
}
function hasOptOutLock(store, channel, recipient) {
  const key = optOutKey(channel, recipient);
  return store.optOutLocks.some((lock) => String(lock.lock_key) === key && !lock.released_at);
}
function addQueueEvent(store, event) {
  store.queueEvents.unshift(Object.freeze({
    event_id: id('evt'),
    created_at: now(),
    ...event
  }));
  store.queueEvents = store.queueEvents.slice(0, 20000);
}
function distance(a, b) {
  const dx = Number(a.lat) - Number(b.lat);
  const dy = Number(a.lng) - Number(b.lng);
  return Math.sqrt(dx * dx + dy * dy);
}
function routeDistance(route = []) {
  let total = 0;
  for (let i = 1; i < route.length; i += 1) total += distance(route[i - 1], route[i]);
  return total;
}
function nearestNeighbor(points = []) {
  if (!points.length) return [];
  const remaining = points.slice(1);
  const route = [points[0]];
  while (remaining.length) {
    const current = route[route.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = distance(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  return route;
}
function twoOpt(route = []) {
  if (route.length < 4) return route;
  let improved = true;
  let best = route.slice();
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i += 1) {
      for (let k = i + 1; k < best.length - 1; k += 1) {
        const next = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (routeDistance(next) + 1e-9 < routeDistance(best)) {
          best = next;
          improved = true;
        }
      }
    }
  }
  return best;
}
function buildRouteForHouseholds(households = []) {
  const points = households
    .filter((h) => Number.isFinite(Number(h.lat)) && Number.isFinite(Number(h.lng)))
    .map((h) => ({ household_id: h.household_id, lat: Number(h.lat), lng: Number(h.lng), normalized_address: h.normalized_address }));
  return twoOpt(nearestNeighbor(points)).map((point, idx) => ({ ...point, order: idx + 1 }));
}
function createTextProviderAdapter(provider = 'manual') {
  return {
    provider,
    async send(message) {
      if (provider === 'manual') {
        const body = encodeURIComponent(String(message.body || ''));
        const to = encodeURIComponent(String(message.to || ''));
        return {
          status: 'manual_required',
          copy_text: String(message.body || ''),
          sms_deep_link: `sms:${to}?&body=${body}`,
          provider: 'manual'
        };
      }
      return {
        status: 'queued_provider',
        provider,
        provider_message_id: id('provider-msg')
      };
    }
  };
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
  const householdsWithDeterministicGeo = visibleRecords(store.households).filter((h) => h.geocode_source === 'deterministic-fallback').length;
  const interactionsWithoutNotes = visibleRecords(store.canvassInteractions).filter((i) => !String(i.notes || '').trim()).length;
  const newestImport = store.imports[0] || null;
  return {
    deterministicGeocodes: householdsWithDeterministicGeo,
    csvGeocodes: Math.max(0, visibleRecords(store.households).length - householdsWithDeterministicGeo),
    interactionNoteCoveragePct: visibleRecords(store.canvassInteractions).length
      ? Number((((visibleRecords(store.canvassInteractions).length - interactionsWithoutNotes) / visibleRecords(store.canvassInteractions).length) * 100).toFixed(1))
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
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
function bearer(req) {
  const token = String(req.headers.authorization || '').replace('Bearer ', '').trim();
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) return null;
  return s;
}
function bearerFromToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return null;
  const s = sessions.get(normalized);
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
function configuredRoleCredentialMaps(store) {
  const entries = [];
  const fromStore = store.settings?.roleCredentialMap;
  if (fromStore && typeof fromStore === 'object') {
    for (const [accessKey, role] of Object.entries(fromStore)) {
      entries.push({ accessKey: String(accessKey), role: String(role || '').toLowerCase(), source: 'store-role-map' });
    }
  }
  const envRaw = process.env.SILO_ROLE_CREDENTIALS || process.env.SILO_ROLE_CREDENTIAL_MAP;
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw);
      if (parsed && typeof parsed === 'object') {
        for (const [accessKey, role] of Object.entries(parsed)) {
          entries.push({ accessKey: String(accessKey), role: String(role || '').toLowerCase(), source: 'env-role-map' });
        }
      }
    } catch (_) {
      // Ignore malformed env JSON map.
    }
  }
  return entries.filter((item) => item.accessKey && ['admin', 'volunteer'].includes(item.role));
}
function findPersistedUser(store, loginId, accessKey) {
  if (!loginId || !accessKey) return null;
  const loginNorm = String(loginId).trim().toLowerCase();
  const keyHash = secretHash(accessKey);
  const user = store.users.find((candidate) => {
    const userLogin = String(candidate.username || candidate.email || candidate.user_id || '').trim().toLowerCase();
    const candidateHash = String(candidate.accessKeyHash || candidate.pinHash || candidate.passwordHash || '').trim();
    return userLogin && candidateHash && userLogin === loginNorm && candidateHash === keyHash;
  });
  if (!user) return null;
  const role = String(user.role || 'volunteer').toLowerCase();
  return {
    userId: String(user.user_id || user.username || user.email || id('user')),
    role: ['admin', 'volunteer'].includes(role) ? role : 'volunteer',
    authSource: 'persisted-user'
  };
}
function assignmentSetForUser(store, user) {
  if (user.role === 'admin') return null;
  const assignedIds = new Set();
  for (const assignment of store.turfAssignments) {
    if (String(assignment.user_id || '').trim() !== String(user.userId || '').trim()) continue;
    for (const householdId of assignment.household_ids || []) assignedIds.add(householdId);
  }
  return assignedIds;
}
function sanitizeVoterForRole(voter, role) {
  if (role === 'volunteer') {
    return {
      voter_id: voter.voter_id,
      first_name: voter.first_name,
      last_name: voter.last_name,
      party: voter.party
    };
  }
  return voter;
}
function isAdminOnlyRoute(req, pathname) {
  if (!pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/api/imports')) return true;
  if (pathname.startsWith('/api/settings')) return true;
  if (pathname.startsWith('/api/export')) return true;
  if (req.method !== 'GET' && pathname.startsWith('/api/assignments')) return true;
  if (req.method === 'DELETE' && pathname.startsWith('/api/')) return true;
  if (req.method === 'POST' && pathname.startsWith('/api/clear')) return true;
  return false;
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
  const parsedUrl = new URL(req.url, 'http://localhost');
  const { pathname: rawPathname } = parsedUrl;
  const pathname = rawPathname === '/silo' ? '/' : (rawPathname.startsWith('/silo/') ? rawPathname.slice('/silo'.length) : rawPathname);
  if (pathname === '/health') return send(res, 200, { ok: true });
  if (serveStatic(req, res, pathname)) return;

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    const accessKey = String(body.accessKey || body.pin || '').trim();
    const loginId = String(body.username || body.email || body.userId || '').trim();
    const store = readStore();
    let principal = findPersistedUser(store, loginId, accessKey);

    if (!principal) {
      const roleMapMatch = configuredRoleCredentialMaps(store).find((candidate) => candidate.accessKey === accessKey);
      if (roleMapMatch) {
        principal = {
          userId: `${roleMapMatch.role}-${secretHash(accessKey).slice(0, 8)}`,
          role: roleMapMatch.role,
          authSource: roleMapMatch.source
        };
      }
    }

    if (!principal) {
      const expectedSecrets = configuredAuthSecrets(store);
      if (!expectedSecrets.length) return send(res, 503, { error: 'Dashboard access key is not configured on the server.' });
      const matched = expectedSecrets.find((candidate) => secretHash(accessKey) === candidate.hash);
      if (matched) {
        principal = { userId: 'admin', role: 'admin', authSource: matched.source };
      }
    }

    if (!principal) return send(res, 401, { error: 'Invalid access key' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { userId: principal.userId, role: principal.role, expiresAt: Date.now() + TOKEN_TTL_MS });
    return send(res, 200, { token, expiresInMs: TOKEN_TTL_MS, authSource: principal.authSource, role: principal.role, userId: principal.userId });
  }

  if (!pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (req.method === 'GET' && pathname === '/api/health') {
    const store = readStore();
    return send(res, 200, {
      ok: true,
      service: 'voter-mapping-silo',
      timestamp: now(),
      counts: {
        households: visibleRecords(store.households).length,
        voters: visibleRecords(store.voters).length,
        imports: store.imports.length,
        annotations: store.mapAnnotations.length,
        canvassInteractions: visibleRecords(store.canvassInteractions).length
      }
    });
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    const eventUser = bearer(req) || bearerFromToken(parsedUrl.searchParams.get('token'));
    if (!eventUser) return send(res, 401, { error: 'Unauthorized' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  const user = bearer(req);
  if (!user) return send(res, 401, { error: 'Unauthorized' });
  if (isAdminOnlyRoute(req, pathname) && user.role !== 'admin') return send(res, 403, { error: 'Forbidden: admin only' });

  if (req.method === 'POST' && pathname === '/api/admin/datasets/clear') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    const confirmation = requireConfirmationKeyword(body, CLEAR_DATASETS_CONFIRMATION_KEYWORD);
    if (!confirmation.ok) return send(res, 400, { error: confirmation.message, requiredKeyword: CLEAR_DATASETS_CONFIRMATION_KEYWORD });

    const store = readStore();
    const deletedAt = now();
    let affectedVoters = 0;
    let affectedHouseholds = 0;
    let affectedInteractions = 0;

    for (const voter of store.voters) {
      if (isSoftDeleted(voter)) continue;
      softDeleteRecord(voter, user.userId, body.reason || 'bulk-dataset-clear');
      voter.deleted_at = deletedAt;
      affectedVoters += 1;
    }
    for (const household of store.households) {
      if (isSoftDeleted(household)) continue;
      softDeleteRecord(household, user.userId, body.reason || 'bulk-dataset-clear');
      household.deleted_at = deletedAt;
      affectedHouseholds += 1;
    }
    for (const interaction of store.canvassInteractions) {
      if (isSoftDeleted(interaction)) continue;
      softDeleteRecord(interaction, user.userId, body.reason || 'bulk-dataset-clear');
      interaction.deleted_at = deletedAt;
      affectedInteractions += 1;
    }

    audit(store, user.userId, 'CLEAR_DATASETS', 'dataset', 'all', {
      affectedVoters,
      affectedHouseholds,
      affectedInteractions,
      reason: String(body.reason || '').trim() || null,
      confirmationKeyword: confirmation.typedKeyword
    });
    writeStore(store);
    publishServerEvent('dataset.cleared', {
      actor: user.userId,
      affectedVoters,
      affectedHouseholds,
      affectedInteractions,
      reason: String(body.reason || '').trim() || null
    });
    return send(res, 200, { ok: true, affectedVoters, affectedHouseholds, affectedInteractions });
  }

  const deleteVoterMatch = pathname.match(/^\/api\/admin\/voters\/([^/]+)$/);
  if (req.method === 'DELETE' && deleteVoterMatch) {
    const voterId = decodeURIComponent(deleteVoterMatch[1]);
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    const confirmation = requireConfirmationKeyword(body, DELETE_VOTER_CONFIRMATION_KEYWORD);
    if (!confirmation.ok) return send(res, 400, { error: confirmation.message, requiredKeyword: DELETE_VOTER_CONFIRMATION_KEYWORD });

    const store = readStore();
    const voter = store.voters.find((item) => item.voter_id === voterId);
    if (!voter) return send(res, 404, { error: 'Voter not found' });
    if (isSoftDeleted(voter)) return send(res, 409, { error: 'Voter already deleted' });

    const reason = String(body.reason || '').trim();
    softDeleteRecord(voter, user.userId, reason || 'admin-voter-delete');
    const relatedInteractions = store.canvassInteractions.filter((item) => item.voter_id === voter.voter_id && !isSoftDeleted(item));
    for (const interaction of relatedInteractions) {
      softDeleteRecord(interaction, user.userId, `cascade-delete:${voter.voter_id}`);
    }

    const activeHouseholdVoters = store.voters.filter((item) => item.household_id === voter.household_id && !isSoftDeleted(item));
    let householdSoftDeleted = false;
    if (!activeHouseholdVoters.length) {
      const household = store.households.find((item) => item.household_id === voter.household_id);
      if (household && !isSoftDeleted(household)) {
        softDeleteRecord(household, user.userId, `cascade-delete:${voter.voter_id}`);
        householdSoftDeleted = true;
      }
      for (const interaction of store.canvassInteractions.filter((item) => item.household_id === voter.household_id && !isSoftDeleted(item))) {
        softDeleteRecord(interaction, user.userId, `cascade-delete:${voter.voter_id}`);
      }
    }

    audit(store, user.userId, 'DELETE_VOTER', 'voter', voter.voter_id, {
      household_id: voter.household_id,
      reason: reason || null,
      relatedInteractionsSoftDeleted: relatedInteractions.length,
      householdSoftDeleted,
      confirmationKeyword: confirmation.typedKeyword
    });
    writeStore(store);
    publishServerEvent('dataset.voter_deleted', {
      actor: user.userId,
      voterId: voter.voter_id,
      householdId: voter.household_id,
      householdSoftDeleted,
      reason: reason || null,
      relatedInteractionsSoftDeleted: relatedInteractions.length
    });
    return send(res, 200, { ok: true, voterId: voter.voter_id, householdSoftDeleted });
  }

  const restoreVoterMatch = pathname.match(/^\/api\/admin\/voters\/([^/]+)\/restore$/);
  if (req.method === 'POST' && restoreVoterMatch) {
    const voterId = decodeURIComponent(restoreVoterMatch[1]);
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    const confirmation = requireConfirmationKeyword(body, DELETE_VOTER_CONFIRMATION_KEYWORD);
    if (!confirmation.ok) return send(res, 400, { error: confirmation.message, requiredKeyword: DELETE_VOTER_CONFIRMATION_KEYWORD });

    const store = readStore();
    const voter = store.voters.find((item) => item.voter_id === voterId);
    if (!voter) return send(res, 404, { error: 'Voter not found' });
    if (!isSoftDeleted(voter)) return send(res, 409, { error: 'Voter is not deleted' });

    restoreRecord(voter);
    withSoftDeleteDefaults(voter);

    let restoredHousehold = false;
    const household = store.households.find((item) => item.household_id === voter.household_id);
    if (household && isSoftDeleted(household)) {
      restoreRecord(household);
      withSoftDeleteDefaults(household);
      restoredHousehold = true;
    }

    const restoredInteractions = [];
    for (const interaction of store.canvassInteractions) {
      if (!isSoftDeleted(interaction)) continue;
      if (interaction.voter_id === voter.voter_id || interaction.household_id === voter.household_id) {
        restoreRecord(interaction);
        withSoftDeleteDefaults(interaction);
        restoredInteractions.push(interaction.interaction_id);
      }
    }

    audit(store, user.userId, 'RESTORE_VOTER', 'voter', voter.voter_id, {
      household_id: voter.household_id,
      restoredHousehold,
      restoredInteractions,
      reason: String(body.reason || '').trim() || null,
      confirmationKeyword: confirmation.typedKeyword
    });
    writeStore(store);
    publishServerEvent('dataset.voter_restored', {
      actor: user.userId,
      voterId: voter.voter_id,
      householdId: voter.household_id,
      restoredHousehold,
      restoredInteractions: restoredInteractions.length
    });
    return send(res, 200, { ok: true, voterId: voter.voter_id, restoredHousehold, restoredInteractions: restoredInteractions.length });
  }

  if (req.method === 'GET' && pathname === '/api/dashboard') {
    const includeDeleted = user.role === 'admin' && new URL(req.url, 'http://localhost').searchParams.get('include_deleted') === 'true';
    const store = readStore();
    const activeVoters = visibleRecords(store.voters, includeDeleted);
    const activeHouseholds = visibleRecords(store.households, includeDeleted);
    const activeInteractions = visibleRecords(store.canvassInteractions, includeDeleted);
    const countyCounts = activeVoters.reduce((acc, v) => ((acc[v.source_county] = (acc[v.source_county] || 0) + 1), acc), {});
    const latestInteractions = latestInteractionByHousehold(activeInteractions);
    const outcomeCounts = [...latestInteractions.values()].reduce((acc, interaction) => ((acc[interaction.outcome] = (acc[interaction.outcome] || 0) + 1), acc), {});
    return send(res, 200, {
      voters: activeVoters.length,
      households: activeHouseholds.length,
      interactions: activeInteractions.length,
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


  if (req.method === 'GET' && pathname === '/api/settings/actblue') {
    const store = readStore();
    return send(res, 200, { actblue_url: String(store.settings?.actblue_url || '') });
  }

  if (req.method === 'POST' && pathname === '/api/settings/actblue') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Forbidden: admin only' });
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const nextUrl = sanitizeActBlueUrl(body.actblue_url);
    if (!nextUrl) return send(res, 400, { error: 'actblue_url must be a valid http/https URL' });
    const store = readStore();
    store.settings.actblue_url = nextUrl;
    audit(store, user.userId, 'SETTINGS_ACTBLUE_URL', 'settings', 'actblue_url', { actblue_url: nextUrl });
    writeStore(store);
    return send(res, 200, { ok: true, actblue_url: nextUrl });
  }

  if (req.method === 'GET' && pathname === '/api/donate') {
    const store = readStore();
    const actblueUrl = String(store.settings?.actblue_url || '').trim();
    return send(res, 200, {
      actblue_url: actblueUrl,
      qr_url: actblueUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(actblueUrl)}` : null,
      share_text: 'Support our campaign',
      canShare: true
    });
  }

  if (req.method === 'GET' && pathname === '/api/queues') {
    const store = readStore();
    return send(res, 200, {
      callQueue: store.callQueue,
      textQueue: store.textQueue,
      optOutLocks: store.optOutLocks,
      queueEvents: store.queueEvents.slice(0, 300)
    });
  }

  if (req.method === 'POST' && pathname === '/api/queues/enqueue') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Forbidden: admin only' });
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const channel = body.channel === 'text' ? 'text' : 'call';
    const recipient = normalizePhone(body.recipient || body.phone || '');
    if (!recipient) return send(res, 400, { error: 'recipient is required' });
    const store = readStore();
    if (hasOptOutLock(store, channel, recipient)) return send(res, 423, { error: 'recipient is opt-out locked', channel, recipient });
    const item = {
      queue_id: id(channel === 'text' ? 'txtq' : 'callq'),
      channel,
      recipient,
      household_id: body.household_id || null,
      voter_id: body.voter_id || null,
      script: String(body.script || body.body || ''),
      status: 'pending',
      created_by: user.userId,
      created_at: now()
    };
    if (channel === 'text') store.textQueue.push(item); else store.callQueue.push(item);
    addQueueEvent(store, { channel, queue_id: item.queue_id, action: 'queued', actor: user.userId, payload: { recipient } });
    writeStore(store);
    return send(res, 201, item);
  }

  if (req.method === 'POST' && pathname === '/api/queues/opt-out') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const channel = body.channel === 'call' ? 'call' : 'text';
    const recipient = normalizePhone(body.recipient || body.phone || '');
    if (!recipient) return send(res, 400, { error: 'recipient is required' });
    const store = readStore();
    const lock = {
      lock_id: id('lock'),
      lock_key: optOutKey(channel, recipient),
      channel,
      recipient,
      reason: String(body.reason || 'recipient-request').trim(),
      created_by: user.userId,
      created_at: now(),
      released_at: null
    };
    store.optOutLocks.unshift(lock);
    addQueueEvent(store, { channel, action: 'opt_out_locked', actor: user.userId, payload: { recipient, reason: lock.reason } });
    writeStore(store);
    return send(res, 201, lock);
  }

  if (req.method === 'POST' && pathname === '/api/text/send') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const provider = String(body.provider || 'manual').trim().toLowerCase();
    const to = normalizePhone(body.to || body.recipient || '');
    const messageBody = String(body.body || body.message || '').trim();
    if (!to || !messageBody) return send(res, 400, { error: 'to and body are required' });
    const store = readStore();
    if (hasOptOutLock(store, 'text', to)) return send(res, 423, { error: 'recipient is opt-out locked', channel: 'text', recipient: to });
    const adapter = createTextProviderAdapter(provider);
    const delivery = await adapter.send({ to, body: messageBody });
    const eventAction = delivery.status === 'manual_required' ? 'manual_send_prepared' : 'provider_send_queued';
    addQueueEvent(store, { channel: 'text', action: eventAction, actor: user.userId, payload: { to, provider: delivery.provider } });
    writeStore(store);
    return send(res, 200, { channel: 'text', to, ...delivery });
  }

  if (req.method === 'POST' && pathname === '/api/turfs') {
    if (user.role !== 'admin') return send(res, 403, { error: 'Forbidden: admin only' });
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const store = readStore();
    const county = String(body.county || 'all').toLowerCase();
    const householdIds = Array.isArray(body.household_ids) ? [...new Set(body.household_ids.map((x) => String(x)))] : [];
    if (!householdIds.length) return send(res, 400, { error: 'household_ids[] required' });
    const turf = {
      turf_id: id('turf'),
      name: String(body.name || `Turf ${store.turfs.length + 1}`),
      county,
      household_ids: householdIds,
      created_by: user.userId,
      created_at: now()
    };
    store.turfs.push(turf);
    audit(store, user.userId, 'CREATE_TURF', 'turf', turf.turf_id, { county, household_count: householdIds.length });
    writeStore(store);
    return send(res, 201, turf);
  }

  if (req.method === 'GET' && pathname === '/api/turfs') {
    const store = readStore();
    return send(res, 200, store.turfs);
  }

  if (req.method === 'POST' && pathname === '/api/routes/optimize') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) return send(res, 400, { error: 'Invalid JSON' });
    const store = readStore();
    const ids = Array.isArray(body.household_ids) ? new Set(body.household_ids.map((x) => String(x))) : null;
    const source = ids ? store.households.filter((h) => ids.has(h.household_id)) : store.households;
    const route = buildRouteForHouseholds(source);
    return send(res, 200, { algorithm: ['nearest-neighbor', '2-opt'], stop_count: route.length, route });
  }

  if (req.method === 'POST' && pathname === '/api/imports/voters') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('multipart/form-data')) {
      return send(res, 415, { error: 'Use multipart/form-data with fields county and file' });
    }
    const bodyBuffer = await parseUploadBody(req).catch((error) => ({ __parseError: error }));
    if (bodyBuffer?.__parseError) {
      const isTooLarge = String(bodyBuffer.__parseError.message || '').includes('too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Upload payload too large. Limit is ${Math.round(MAX_UPLOAD_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid multipart upload' });
    }

    let payload;
    try {
      payload = extractMultipartFile(bodyBuffer, contentType);
    } catch (error) {
      return send(res, 400, { error: error.message || 'Invalid multipart payload' });
    }

    const county = String(payload.fields.county || '').toLowerCase().trim();
    if (!['pierce', 'thurston'].includes(county)) return send(res, 400, { error: 'County must be pierce or thurston' });
    if (!payload.file?.buffer?.length) return send(res, 400, { error: 'CSV file required' });

    const importId = id('import');
    const filename = payload.file.filename || `${county}-${importId}.csv`;
    const safeFileName = `${importId}-${path.basename(filename).replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
    const filePath = path.join(IMPORT_FILES_DIR, safeFileName);
    fs.writeFileSync(filePath, payload.file.buffer);

    const store = readStore();
    const importRecord = {
      import_id: importId,
      county,
      uploaded_by: user.userId,
      uploaded_at: now(),
      status: 'uploaded',
      source: 'manual-upload',
      original_filename: filename,
      file_path: filePath,
      file_size_bytes: payload.file.buffer.length,
      processed_rows: 0,
      accepted_rows: 0,
      rejected_rows: 0,
      progress_pct: 0,
      rejected_detail: []
    };
    store.imports.unshift(importRecord);
    writeStore(store);
    publishServerEvent('import.progress', {
      importId,
      status: 'uploaded',
      progressPct: 0,
      processedRows: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      county
    });
    setImmediate(() => {
      processImportFile(importId).catch((error) => {
        updateImport(importId, (current) => {
          current.status = 'failed';
          current.error = error.message;
          current.completed_at = now();
        });
      });
    });
    return send(res, 202, { importId, status: 'uploaded' });
  }

  if (req.method === 'POST' && pathname === '/api/imports/voters/remote') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    if (!Array.isArray(body.files) || !body.files.length) {
      return send(res, 400, { error: 'files[] is required' });
    }

    const createdImports = [];
    for (const file of body.files.slice(0, 12)) {
      const county = String(file.county || '').toLowerCase().trim();
      const url = String(file.url || '').trim();
      const label = String(file.label || url || `${county}-remote`).trim();
      if (!['pierce', 'thurston'].includes(county) || !url) {
        createdImports.push({ label, county, url, error: 'Each file needs a valid county (pierce/thurston) and URL' });
        continue;
      }
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const fileBuffer = Buffer.from(await response.arrayBuffer());
        const importId = id('import');
        const safeFileName = `${importId}-${path.basename(label).replace(/[^a-zA-Z0-9._-]+/g, '_')}.csv`;
        const filePath = path.join(IMPORT_FILES_DIR, safeFileName);
        fs.writeFileSync(filePath, fileBuffer);

        const store = readStore();
        store.imports.unshift({
          import_id: importId,
          county,
          uploaded_by: user.userId,
          uploaded_at: now(),
          status: 'uploaded',
          source: `remote-url:${label}`,
          original_filename: `${label}.csv`,
          file_path: filePath,
          file_size_bytes: fileBuffer.length,
          processed_rows: 0,
          accepted_rows: 0,
          rejected_rows: 0,
          progress_pct: 0,
          rejected_detail: []
        });
        writeStore(store);
        publishServerEvent('import.progress', {
          importId,
          status: 'uploaded',
          progressPct: 0,
          processedRows: 0,
          acceptedRows: 0,
          rejectedRows: 0,
          county
        });
        createdImports.push({ label, county, url, importId, status: 'uploaded' });
        setImmediate(() => processImportFile(importId).catch((error) => {
          updateImport(importId, (current) => {
            current.status = 'failed';
            current.error = error.message;
            current.completed_at = now();
          });
        }));
      } catch (error) {
        createdImports.push({ label, county, url, error: `Unable to fetch/queue CSV: ${error.message}` });
      }
    }

    return send(res, 202, { ok: true, results: createdImports });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/map/features')) {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const county = params.get('county') || 'all';
    const includeDeleted = user.role === 'admin' && params.get('include_deleted') === 'true';
    const store = readStore();
    const householdsSource = visibleRecords(store.households, includeDeleted);
    const votersSource = visibleRecords(store.voters, includeDeleted);
    const interactionsSource = visibleRecords(store.canvassInteractions, includeDeleted);
    const eligible = new Set(county === 'all' ? householdsSource.map((h) => h.household_id) : votersSource.filter((v) => v.source_county === county).map((v) => v.household_id));
    const assignmentScope = assignmentSetForUser(store, user);
    if (assignmentScope) {
      for (const householdId of [...eligible]) {
        if (!assignmentScope.has(householdId)) eligible.delete(householdId);
      }
    }
    const latestByHousehold = latestInteractionByHousehold(interactionsSource);
    const votersByHousehold = new Map();
    for (const voter of votersSource) {
      if (county !== 'all' && voter.source_county !== county) continue;
      if (!eligible.has(voter.household_id)) continue;
      const group = votersByHousehold.get(voter.household_id);
      const sanitized = sanitizeVoterForRole(voter, user.role);
      if (group) group.push(sanitized);
      else votersByHousehold.set(voter.household_id, [sanitized]);
    }
    const households = [];
    for (const household of householdsSource) {
      if (!eligible.has(household.household_id)) continue;
      const voters = votersByHousehold.get(household.household_id) || [];
      const last = latestByHousehold.get(household.household_id);
      households.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [household.lng, household.lat] }, properties: { household_id: household.household_id, normalized_address: household.normalized_address, voter_count: voters.length, voters, status: last?.outcome || 'Not Attempted', deleted_at: household.deleted_at, deleted_by: household.deleted_by, delete_reason: household.delete_reason } });
    }
    const annotations = user.role === 'admin'
      ? store.mapAnnotations.map((a) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: a }))
      : [];
    return send(res, 200, { households: { type: 'FeatureCollection', features: households }, annotations: { type: 'FeatureCollection', features: annotations } });
  }

  if (req.method === 'POST' && pathname === '/api/canvass/logs') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    if (!body.household_id || !body.outcome) return send(res, 400, { error: 'household_id and outcome are required' });
    const store = readStore();
    const household = store.households.find((item) => item.household_id === body.household_id);
    if (!household || isSoftDeleted(household)) return send(res, 404, { error: 'Household not found' });
    const assignmentScope = assignmentSetForUser(store, user);
    if (assignmentScope && !assignmentScope.has(body.household_id)) {
      return send(res, 403, { error: 'Forbidden: household outside assigned turf' });
    }
    if (body.voter_id) {
      const voter = store.voters.find((item) => item.voter_id === body.voter_id && item.household_id === body.household_id);
      if (!voter || isSoftDeleted(voter)) return send(res, 404, { error: 'Voter not found' });
    }
    const record = { interaction_id: id('int'), household_id: body.household_id, voter_id: body.voter_id || null, outcome: body.outcome, notes: body.notes || '', next_followup_at: body.next_followup_at || null, created_by: 'dashboard', created_at: now(), deleted_at: null, deleted_by: null, delete_reason: null };
    store.canvassInteractions.unshift(record); audit(store, 'dashboard', 'CANVASS_LOG', 'household', body.household_id, { outcome: body.outcome }); writeStore(store);
    publishServerEvent('canvass.event_created', {
      interaction: record
    });
    return send(res, 200, record);
  }

  if (req.method === 'GET' && pathname === '/api/assignments') {
    const store = readStore();
    if (user.role === 'admin') return send(res, 200, store.turfAssignments);
    const mine = store.turfAssignments.filter((assignment) => String(assignment.user_id) === String(user.userId));
    return send(res, 200, mine);
  }

  if (req.method === 'POST' && pathname === '/api/assignments') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    if (!body.user_id || !Array.isArray(body.household_ids) || !body.household_ids.length) {
      return send(res, 400, { error: 'user_id and household_ids[] are required' });
    }
    const store = readStore();
    const householdIds = [...new Set(body.household_ids.map((item) => String(item)))];
    const route = buildRouteForHouseholds(store.households.filter((household) => householdIds.includes(household.household_id)));
    const record = {
      assignment_id: id('assign'),
      user_id: String(body.user_id),
      turf_id: String(body.turf_id || id('turf')),
      county: String(body.county || 'all').toLowerCase(),
      household_ids: householdIds,
      route_order: route,
      checklist: route.map((stop) => ({ household_id: stop.household_id, order: stop.order, completed_at: null })),
      created_by: user.userId,
      created_at: now()
    };
    store.turfAssignments.push(record);
    audit(store, user.userId, 'ASSIGN_TURF', 'assignment', record.assignment_id, { user_id: record.user_id, household_count: record.household_ids.length });
    writeStore(store);
    return send(res, 201, record);
  }

  if (req.method === 'POST' && pathname === '/api/annotations') {
    const body = await parseBody(req).catch((error) => ({ __parseError: error }));
    if (body?.__parseError) {
      const isTooLarge = String(body.__parseError.message || '').includes('Payload too large');
      return send(res, isTooLarge ? 413 : 400, { error: isTooLarge ? `Payload too large. Limit is ${Math.round(MAX_JSON_BODY_BYTES / (1024 * 1024))}MB.` : 'Invalid JSON' });
    }
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) return send(res, 400, { error: 'lat/lng required' });
    const store = readStore();
    const record = { annotation_id: id('ann'), lat: body.lat, lng: body.lng, type: body.type || 'note', note: body.note || '', followup_at: body.followup_at || null, created_by: 'dashboard', created_at: now() };
    store.mapAnnotations.unshift(record); audit(store, 'dashboard', 'ADD_ANNOTATION', 'annotation', record.annotation_id, { type: record.type }); writeStore(store);
    publishServerEvent('annotation.created', {
      annotation: record
    });
    return send(res, 200, record);
  }

  if (req.method === 'GET' && pathname === '/api/imports') return send(res, 200, readStore().imports.slice(0, 50));
  if (req.method === 'GET' && pathname.startsWith('/api/imports/')) {
    const importId = pathname.split('/').pop();
    const record = readStore().imports.find((item) => item.import_id === importId);
    if (!record) return send(res, 404, { error: 'Import not found' });
    return send(res, 200, record);
  }
  if (req.method === 'GET' && pathname === '/api/audit') return send(res, 200, readStore().auditEvents.slice(0, 200));
  return send(res, 404, { error: 'Not found' });
}

function createServer() { ensureStore(); return http.createServer((req, res) => handler(req, res).catch((e) => send(res, 500, { error: e.message }))); }

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Voter mapping silo running at http://localhost:${PORT}/app/`));
}

module.exports = { createServer, ensureStore, STORE_PATH };

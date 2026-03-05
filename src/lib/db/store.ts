export type ImportBatch = {
  id: string;
  source_file_name: string;
  uploaded_at: string;
  row_count: number;
  inserted_count: number;
  duplicate_count: number;
  invalid_count: number;
  pinned_count: number;
  pending_geocode_count: number;
  status: 'processing' | 'complete' | 'failed';
  error_summary?: string;
};

export type Voter = {
  id: string;
  import_id?: string;
  external_voter_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  birth_year?: number;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  precinct?: string;
  legislative_district?: string;
  congressional_district?: string;
  latitude?: number;
  longitude?: number;
  geocode_status?: 'pending' | 'done' | 'failed';
  geocode_error?: string;
  phone?: string;
  email?: string;
  do_not_contact: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type OutreachLog = {
  id: string;
  voter_id: string;
  channel: 'door' | 'phone' | 'text';
  outcome: string;
  notes?: string;
  timestamp: string;
  metadata_json?: Record<string, unknown>;
  created_at: string;
  deleted_at?: string;
};

export type AuditLog = {
  id: string;
  action: string;
  entity: 'voter' | 'import' | 'outreach' | 'system';
  entity_id?: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

type DBState = {
  imports: ImportBatch[];
  voters: Voter[];
  outreach_logs: OutreachLog[];
  audit_logs: AuditLog[];
  text_templates: { id: string; name: string; body: string; created_at: string }[];
  mapping_templates: Record<string, Record<string, string>>;
};

const KEY = 'afc_ops_db_v2';

function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now() {
  return new Date().toISOString();
}

function storageLike() {
  return (globalThis as any).localStorage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
}

function loadState(): DBState {
  const storage = storageLike();
  if (!storage) return { imports: [], voters: [], outreach_logs: [], audit_logs: [], text_templates: [], mapping_templates: {} };
  const raw = storage.getItem(KEY);
  if (!raw) return { imports: [], voters: [], outreach_logs: [], audit_logs: [], text_templates: [], mapping_templates: {} };
  try {
    return JSON.parse(raw) as DBState;
  } catch {
    return { imports: [], voters: [], outreach_logs: [], audit_logs: [], text_templates: [], mapping_templates: {} };
  }
}

function saveState(state: DBState) {
  const storage = storageLike();
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify(state));
}

export function resetDb() {
  const storage = storageLike();
  storage?.removeItem(KEY);
}

function dedupeKey(row: Record<string, string>) {
  if (row.external_voter_id) return `id:${row.external_voter_id.toLowerCase()}`;
  return `name_addr:${(row.first_name ?? '').toLowerCase()}|${(row.last_name ?? '').toLowerCase()}|${(row.address ?? '').toLowerCase()}|${(row.zip ?? '').toLowerCase()}|${row.birth_year ?? ''}`;
}

function parseTags(tags?: string) {
  if (!tags) return undefined;
  return tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
}

function toVoter(row: Record<string, string>, importId: string): Voter {
  const created = now();
  const lat = row.latitude ? Number(row.latitude) : undefined;
  const lng = row.longitude ? Number(row.longitude) : undefined;
  const validCoords = lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return {
    id: id(),
    import_id: importId,
    external_voter_id: row.external_voter_id,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    birth_year: row.birth_year ? Number(row.birth_year) : undefined,
    gender: row.gender,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    precinct: row.precinct,
    legislative_district: row.legislative_district,
    congressional_district: row.congressional_district,
    latitude: validCoords ? lat : undefined,
    longitude: validCoords ? lng : undefined,
    geocode_status: validCoords ? 'done' : 'pending',
    phone: row.phone,
    email: row.email,
    do_not_contact: false,
    tags: parseTags(row.tags),
    created_at: created,
    updated_at: created
  };
}

export function importRows(sourceFileName: string, rows: Record<string, string>[], invalidCount: number) {
  const state = loadState();
  const batch: ImportBatch = {
    id: id(),
    source_file_name: sourceFileName,
    uploaded_at: now(),
    row_count: rows.length + invalidCount,
    inserted_count: 0,
    duplicate_count: 0,
    invalid_count: invalidCount,
    pinned_count: 0,
    pending_geocode_count: 0,
    status: 'processing'
  };
  state.imports.unshift(batch);

  const existingKeys = new Set(state.voters.filter((v) => !v.deleted_at).map((v) => dedupeKey(v as unknown as Record<string, string>)));
  for (const row of rows) {
    const key = dedupeKey(row);
    if (existingKeys.has(key)) {
      batch.duplicate_count += 1;
      continue;
    }
    const voter = toVoter(row, batch.id);
    state.voters.push(voter);
    existingKeys.add(key);
    batch.inserted_count += 1;
    if (voter.latitude != null && voter.longitude != null) batch.pinned_count += 1;
    else batch.pending_geocode_count += 1;
  }

  const verified = state.voters.filter((v) => v.import_id === batch.id && !v.deleted_at).length;
  if (verified !== batch.inserted_count) {
    batch.status = 'failed';
    batch.error_summary = `Insert verification failed. inserted_count=${batch.inserted_count}, query_count=${verified}`;
  } else {
    batch.status = 'complete';
  }

  state.audit_logs.unshift({
    id: id(),
    action: batch.status === 'complete' ? 'IMPORT_COMPLETE' : 'IMPORT_FAILED',
    entity: 'import',
    entity_id: batch.id,
    payload_json: {
      source_file_name: sourceFileName,
      row_count: batch.row_count,
      inserted_count: batch.inserted_count,
      duplicate_count: batch.duplicate_count,
      invalid_count: batch.invalid_count,
      pinned_count: batch.pinned_count,
      pending_geocode_count: batch.pending_geocode_count
    },
    created_at: now()
  });

  saveState(state);
  return batch;
}

export function listImports() {
  return loadState().imports;
}

export function listVoters() {
  return loadState().voters.filter((v) => !v.deleted_at);
}

export function listOutreachLogs(voterId?: string) {
  const logs = loadState().outreach_logs.filter((l) => !l.deleted_at);
  return voterId ? logs.filter((l) => l.voter_id === voterId) : logs;
}

export function listAuditLogs() {
  return loadState().audit_logs;
}

export function logOutreach(input: Omit<OutreachLog, 'id' | 'created_at' | 'timestamp'> & { timestamp?: string }) {
  const state = loadState();
  const entry: OutreachLog = { ...input, id: id(), created_at: now(), timestamp: input.timestamp ?? now() };
  state.outreach_logs.unshift(entry);
  state.audit_logs.unshift({
    id: id(),
    action: 'OUTREACH_LOG_CREATE',
    entity: 'outreach',
    entity_id: entry.id,
    payload_json: { voter_id: entry.voter_id, channel: entry.channel, outcome: entry.outcome },
    created_at: now()
  });
  saveState(state);
}

export function saveTemplate(name: string, body: string) {
  const state = loadState();
  state.text_templates.unshift({ id: id(), name, body, created_at: now() });
  saveState(state);
}

export function listTemplates() {
  return loadState().text_templates;
}

export function deleteVoter(voterId: string) {
  const state = loadState();
  const deletedAt = now();
  state.voters = state.voters.map((v) => (v.id === voterId ? { ...v, deleted_at: deletedAt } : v));
  state.outreach_logs = state.outreach_logs.map((l) => (l.voter_id === voterId ? { ...l, deleted_at: deletedAt } : l));
  state.audit_logs.unshift({ id: id(), action: 'VOTER_DELETE', entity: 'voter', entity_id: voterId, payload_json: {}, created_at: now() });
  saveState(state);
}

export function deleteOutreachLog(logId: string) {
  const state = loadState();
  state.outreach_logs = state.outreach_logs.map((l) => (l.id === logId ? { ...l, deleted_at: now() } : l));
  state.audit_logs.unshift({ id: id(), action: 'OUTREACH_DELETE', entity: 'outreach', entity_id: logId, payload_json: {}, created_at: now() });
  saveState(state);
}

export function clearAll() {
  const state = loadState();
  const deletedAt = now();
  const voterCount = state.voters.filter((v) => !v.deleted_at).length;
  const outreachCount = state.outreach_logs.filter((l) => !l.deleted_at).length;
  state.voters = state.voters.map((v) => ({ ...v, deleted_at: deletedAt }));
  state.outreach_logs = state.outreach_logs.map((l) => ({ ...l, deleted_at: deletedAt }));
  state.audit_logs.unshift({ id: id(), action: 'PURGE_RUN', entity: 'system', payload_json: { voterCount, outreachCount, mode: 'all' }, created_at: now() });
  saveState(state);
}

export function clearByImport(importId: string) {
  const state = loadState();
  const deletedAt = now();
  const targetVoters = state.voters.filter((v) => v.import_id === importId && !v.deleted_at).map((v) => v.id);
  state.voters = state.voters.map((v) => (v.import_id === importId ? { ...v, deleted_at: deletedAt } : v));
  state.outreach_logs = state.outreach_logs.map((l) => (targetVoters.includes(l.voter_id) ? { ...l, deleted_at: deletedAt } : l));
  state.audit_logs.unshift({ id: id(), action: 'PURGE_RUN', entity: 'system', payload_json: { importId, voterCount: targetVoters.length, mode: 'import' }, created_at: now() });
  saveState(state);
}

export function saveMappingTemplate(name: string, mapping: Record<string, string>) {
  const state = loadState();
  state.mapping_templates[name] = mapping;
  saveState(state);
}

export function listMappingTemplates() {
  return loadState().mapping_templates;
}

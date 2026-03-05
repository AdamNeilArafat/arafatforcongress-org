import { buildNormalizedAddress } from '../geocoding/address';

export type ImportBatch = {
  id: string;
  source_file_name: string;
  uploaded_at: string;
  row_count: number;
  inserted_count: number;
  duplicate_count: number;
  invalid_count: number;
  pinnable_count: number;
  geocode_queued_count: number;
  geocode_success_count: number;
  geocode_failed_count: number;
  blocked_count: number;
  status: 'processing' | 'complete' | 'failed';
  error_summary?: string;
};

export type GeocodeStatus = 'not_needed' | 'pending' | 'success' | 'failed' | 'blocked_missing_fields';

export type Voter = {
  id: string;
  import_id?: string;
  external_voter_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;
  birth_year?: number;
  gender?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  full_address?: string;
  precinct?: string;
  legislative_district?: string;
  congressional_district?: string;
  latitude?: number;
  longitude?: number;
  geocode_status: GeocodeStatus;
  geocode_provider?: string;
  geocode_confidence?: number;
  geocode_error?: string;
  geocode_attempts: number;
  phone?: string;
  email?: string;
  do_not_contact: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type GeocodeJob = {
  id: string;
  voter_id: string;
  import_id?: string;
  full_address: string;
  status: 'queued' | 'processing' | 'success' | 'failed' | 'cancelled';
  attempts: number;
  last_error?: string;
  next_run_at: string;
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
  entity: 'voter' | 'import' | 'outreach' | 'system' | 'geocode_job';
  entity_id?: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};

type DBState = {
  imports: ImportBatch[];
  voters: Voter[];
  geocode_jobs: GeocodeJob[];
  outreach_logs: OutreachLog[];
  audit_logs: AuditLog[];
  text_templates: { id: string; name: string; body: string; created_at: string }[];
  mapping_templates: Record<string, Record<string, string>>;
};

const KEY = 'afc_ops_db_v3';

function id() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function now() { return new Date().toISOString(); }

function storageLike() {
  return (globalThis as any).localStorage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
}

const empty = (): DBState => ({ imports: [], voters: [], geocode_jobs: [], outreach_logs: [], audit_logs: [], text_templates: [], mapping_templates: {} });

function loadState(): DBState {
  const storage = storageLike();
  if (!storage) return empty();
  const raw = storage.getItem(KEY);
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as Partial<DBState>;
    return { ...empty(), ...parsed, geocode_jobs: parsed.geocode_jobs ?? [] };
  } catch {
    return empty();
  }
}

function saveState(state: DBState) {
  const storage = storageLike();
  if (!storage) return;
  storage.setItem(KEY, JSON.stringify(state));
}

export function withDbWrite<T>(fn: (state: DBState) => T): T {
  const state = loadState();
  const result = fn(state);
  saveState(state);
  return result;
}

export function resetDb() {
  storageLike()?.removeItem(KEY);
}

function dedupeKey(row: Partial<Voter & Record<string, string>>) {
  if (row.external_voter_id) return `id:${row.external_voter_id.toLowerCase()}`;
  const addr = (row.address_line1 ?? row.address ?? '').toLowerCase();
  return `name_addr:${(row.first_name ?? '').toLowerCase()}|${(row.last_name ?? '').toLowerCase()}|${addr}|${(row.zip ?? '').toLowerCase()}|${row.birth_year ?? ''}`;
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
  const normalizedAddress = buildNormalizedAddress({
    address: row.address,
    address_line1: row.address_line1,
    regstnum: row.regstnum,
    regstfrac: row.regstfrac,
    regstname: row.regstname,
    regsttype: row.regsttype,
    regunittype: row.regunittype,
    regunitnum: row.regunitnum,
    city: row.city,
    state: row.state,
    zip: row.zip
  });

  let geocodeStatus: GeocodeStatus = 'pending';
  if (validCoords) geocodeStatus = 'not_needed';
  else if (normalizedAddress.missingRequiredParts) geocodeStatus = 'blocked_missing_fields';

  return {
    id: id(),
    import_id: importId,
    external_voter_id: row.external_voter_id,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    suffix: row.suffix,
    birth_year: row.birth_year ? Number(row.birth_year) : undefined,
    gender: row.gender,
    address_line1: normalizedAddress.address_line1,
    city: normalizedAddress.city,
    state: normalizedAddress.state,
    zip: normalizedAddress.zip,
    full_address: normalizedAddress.full_address,
    precinct: row.precinct,
    legislative_district: row.legislative_district,
    congressional_district: row.congressional_district,
    latitude: validCoords ? lat : undefined,
    longitude: validCoords ? lng : undefined,
    geocode_status: geocodeStatus,
    geocode_attempts: 0,
    phone: row.phone,
    email: row.email,
    do_not_contact: false,
    tags: parseTags(row.tags),
    created_at: created,
    updated_at: created
  };
}

export function importRows(sourceFileName: string, rows: Record<string, string>[], invalidCount: number) {
  return withDbWrite((state) => {
    const batch: ImportBatch = {
      id: id(),
      source_file_name: sourceFileName,
      uploaded_at: now(),
      row_count: rows.length + invalidCount,
      inserted_count: 0,
      duplicate_count: 0,
      invalid_count: invalidCount,
      pinnable_count: 0,
      geocode_queued_count: 0,
      geocode_success_count: 0,
      geocode_failed_count: 0,
      blocked_count: 0,
      status: 'processing'
    };
    state.imports.unshift(batch);

    const existingKeys = new Set(state.voters.filter((v) => !v.deleted_at).map((v) => dedupeKey(v)));
    for (const row of rows) {
      const key = dedupeKey(row as any);
      if (existingKeys.has(key)) {
        batch.duplicate_count += 1;
        continue;
      }
      const voter = toVoter(row, batch.id);
      state.voters.push(voter);
      existingKeys.add(key);
      batch.inserted_count += 1;

      if (voter.latitude != null && voter.longitude != null) {
        batch.pinnable_count += 1;
      } else if (voter.geocode_status === 'pending' && voter.full_address) {
        batch.geocode_queued_count += 1;
        state.geocode_jobs.push({
          id: id(),
          voter_id: voter.id,
          import_id: batch.id,
          full_address: voter.full_address,
          status: 'queued',
          attempts: 0,
          next_run_at: now(),
          created_at: now(),
          updated_at: now()
        });
      } else if (voter.geocode_status === 'blocked_missing_fields') {
        batch.blocked_count += 1;
      }
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
        pinnable_count: batch.pinnable_count,
        geocode_queued_count: batch.geocode_queued_count,
        blocked_count: batch.blocked_count
      },
      created_at: now()
    });

    return batch;
  });
}

export function updateImportGeocodeCounters(importId: string) {
  return withDbWrite((state) => {
    const batch = state.imports.find((item) => item.id === importId);
    if (!batch) return;
    const voters = state.voters.filter((v) => v.import_id === importId && !v.deleted_at);
    batch.pinnable_count = voters.filter((v) => v.latitude != null && v.longitude != null).length;
    batch.geocode_success_count = voters.filter((v) => v.geocode_status === 'success').length;
    batch.geocode_failed_count = voters.filter((v) => v.geocode_status === 'failed').length;
    batch.blocked_count = voters.filter((v) => v.geocode_status === 'blocked_missing_fields').length;
  });
}

export function listImports() { return loadState().imports; }
export function listVoters() { return loadState().voters.filter((v) => !v.deleted_at); }
export function listGeocodeJobs() { return loadState().geocode_jobs.filter((j) => !j.deleted_at); }

export function listOutreachLogs(voterId?: string) {
  const logs = loadState().outreach_logs.filter((l) => !l.deleted_at);
  return voterId ? logs.filter((l) => l.voter_id === voterId) : logs;
}

export function listAuditLogs() { return loadState().audit_logs; }

export function logOutreach(input: Omit<OutreachLog, 'id' | 'created_at' | 'timestamp'> & { timestamp?: string }) {
  withDbWrite((state) => {
    const entry: OutreachLog = { ...input, id: id(), created_at: now(), timestamp: input.timestamp ?? now() };
    state.outreach_logs.unshift(entry);
    state.audit_logs.unshift({ id: id(), action: 'OUTREACH_LOG_CREATE', entity: 'outreach', entity_id: entry.id, payload_json: { voter_id: entry.voter_id, channel: entry.channel, outcome: entry.outcome }, created_at: now() });
  });
}

export function saveTemplate(name: string, body: string) {
  withDbWrite((state) => { state.text_templates.unshift({ id: id(), name, body, created_at: now() }); });
}

export function listTemplates() { return loadState().text_templates; }

export function deleteVoter(voterId: string) {
  withDbWrite((state) => {
    const deletedAt = now();
    state.voters = state.voters.map((v) => (v.id === voterId ? { ...v, deleted_at: deletedAt } : v));
    state.outreach_logs = state.outreach_logs.map((l) => (l.voter_id === voterId ? { ...l, deleted_at: deletedAt } : l));
    state.geocode_jobs = state.geocode_jobs.map((j) => (j.voter_id === voterId ? { ...j, deleted_at: deletedAt, status: 'cancelled' } : j));
    state.audit_logs.unshift({ id: id(), action: 'VOTER_DELETE', entity: 'voter', entity_id: voterId, payload_json: {}, created_at: now() });
  });
}

export function deleteOutreachLog(logId: string) {
  withDbWrite((state) => {
    state.outreach_logs = state.outreach_logs.map((l) => (l.id === logId ? { ...l, deleted_at: now() } : l));
    state.audit_logs.unshift({ id: id(), action: 'OUTREACH_DELETE', entity: 'outreach', entity_id: logId, payload_json: {}, created_at: now() });
  });
}

export function clearAll() {
  withDbWrite((state) => {
    const deletedAt = now();
    const voterCount = state.voters.filter((v) => !v.deleted_at).length;
    const outreachCount = state.outreach_logs.filter((l) => !l.deleted_at).length;
    state.voters = state.voters.map((v) => ({ ...v, deleted_at: deletedAt }));
    state.outreach_logs = state.outreach_logs.map((l) => ({ ...l, deleted_at: deletedAt }));
    state.geocode_jobs = state.geocode_jobs.map((j) => ({ ...j, deleted_at: deletedAt, status: 'cancelled' }));
    state.audit_logs.unshift({ id: id(), action: 'PURGE_RUN', entity: 'system', payload_json: { voterCount, outreachCount, mode: 'all' }, created_at: now() });
  });
}

export function clearByImport(importId: string) {
  withDbWrite((state) => {
    const deletedAt = now();
    const targetVoters = state.voters.filter((v) => v.import_id === importId && !v.deleted_at).map((v) => v.id);
    state.voters = state.voters.map((v) => (v.import_id === importId ? { ...v, deleted_at: deletedAt } : v));
    state.outreach_logs = state.outreach_logs.map((l) => (targetVoters.includes(l.voter_id) ? { ...l, deleted_at: deletedAt } : l));
    state.geocode_jobs = state.geocode_jobs.map((j) => (j.import_id === importId ? { ...j, deleted_at: deletedAt, status: 'cancelled' } : j));
    state.audit_logs.unshift({ id: id(), action: 'PURGE_RUN', entity: 'system', payload_json: { importId, voterCount: targetVoters.length, mode: 'import' }, created_at: now() });
  });
}

export function saveMappingTemplate(name: string, mapping: Record<string, string>) {
  withDbWrite((state) => { state.mapping_templates[name] = mapping; });
}

export function listMappingTemplates() { return loadState().mapping_templates; }

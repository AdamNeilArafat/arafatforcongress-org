PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  canonical_address_id TEXT,
  household_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  household_id TEXT,
  line1 TEXT,
  line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'US',
  normalized_text TEXT,
  normalized_hash TEXT,
  latitude REAL,
  longitude REAL,
  geocode_status TEXT NOT NULL DEFAULT 'pending',
  geocode_provider TEXT,
  geocode_quality REAL,
  geocode_metadata_json TEXT,
  census_tract TEXT,
  census_block_group TEXT,
  district_ids_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  household_id TEXT,
  primary_address_id TEXT,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  preferred_name TEXT,
  source_name TEXT,
  source_record_id TEXT,
  source_provenance_json TEXT,
  raw_import_payload_json TEXT,
  dedupe_hash TEXT,
  confidence_score REAL DEFAULT 0,
  outreach_status TEXT DEFAULT 'not_contacted',
  district_ids_json TEXT,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  suppression_flag INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  verified_at TEXT,
  FOREIGN KEY (household_id) REFERENCES households(id),
  FOREIGN KEY (primary_address_id) REFERENCES addresses(id)
);

CREATE TABLE IF NOT EXISTS phones (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  number_normalized TEXT NOT NULL,
  number_raw TEXT,
  phone_type TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_valid INTEGER,
  quality_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  email_raw TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  is_valid INTEGER,
  quality_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  label TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL,
  mapping_json TEXT,
  dedupe_rules_json TEXT,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  inserted_rows INTEGER DEFAULT 0,
  merged_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  paused INTEGER DEFAULT 0,
  cursor INTEGER DEFAULT 0,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_rows (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  raw_row_json TEXT NOT NULL,
  normalized_row_json TEXT,
  status TEXT NOT NULL DEFAULT 'staged',
  merge_contact_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id)
);

CREATE TABLE IF NOT EXISTS merge_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  import_job_id TEXT,
  import_row_id TEXT,
  merge_type TEXT NOT NULL,
  confidence REAL,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id),
  FOREIGN KEY (import_row_id) REFERENCES import_rows(id)
);

CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  scope_json TEXT,
  progress INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrichment_events (
  id TEXT PRIMARY KEY,
  enrichment_job_id TEXT,
  contact_id TEXT,
  provider TEXT,
  event_type TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (enrichment_job_id) REFERENCES enrichment_jobs(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS canvass_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  household_id TEXT,
  volunteer_id TEXT,
  channel TEXT,
  outcome_code TEXT,
  notes TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS volunteer_assignments (
  id TEXT PRIMARY KEY,
  volunteer_id TEXT NOT NULL,
  assignment_type TEXT NOT NULL,
  turf_id TEXT,
  route_id TEXT,
  contact_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL,
  distance_meters REAL,
  duration_seconds REAL,
  geometry_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_stops (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  contact_id TEXT,
  address_id TEXT,
  stop_order INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id)
);

CREATE TABLE IF NOT EXISTS suppression_flags (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT,
  reason TEXT,
  source TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS consent_flags (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT,
  consent_state TEXT NOT NULL,
  evidence_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS api_cache (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  value_json TEXT,
  status TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_dedupe_hash ON contacts(dedupe_hash);
CREATE INDEX IF NOT EXISTS idx_import_rows_job_status ON import_rows(import_job_id, status);
CREATE INDEX IF NOT EXISTS idx_api_cache_provider_key ON api_cache(provider, cache_key);

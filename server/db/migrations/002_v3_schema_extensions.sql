PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS volunteer_users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'volunteer',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_exports (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  file_path TEXT,
  exported_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (exported_by) REFERENCES volunteer_users(id)
);

CREATE TABLE IF NOT EXISTS map_layers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  layer_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT,
  scope TEXT NOT NULL DEFAULT 'private',
  filter_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES volunteer_users(id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  household_id TEXT,
  volunteer_id TEXT,
  note_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  ai_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (household_id) REFERENCES households(id),
  FOREIGN KEY (volunteer_id) REFERENCES volunteer_users(id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_route_exports_route ON route_exports(route_id);
CREATE INDEX IF NOT EXISTS idx_saved_filters_owner ON saved_filters(owner_id);

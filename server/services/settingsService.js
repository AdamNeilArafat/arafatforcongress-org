import { db, nowIso, randomId } from '../db/index.js';

const DEFAULT_SETTINGS = {
  providerSelection: {
    geocoderPrimary: 'census_geocoder',
    geocoderFallback: 'nominatim',
    routing: 'openrouteservice_optional',
    ai: 'null_ai'
  },
  limits: { retries: 2, timeoutMs: 12000, cacheTtlSeconds: 86400 },
  dedupeRules: { exactEmail: true, normalizedPhone: true, nameStreetZip: true, householdMerge: true },
  importDefaults: { chunkSize: 250, dryRun: true },
  overlays: { demographics: true, legislative: true, finance: true, places: true },
  audit: { providerLogging: true }
};

function getSettingsLayer() {
  const row = db.prepare("SELECT * FROM map_layers WHERE layer_type='system_settings' ORDER BY updated_at DESC LIMIT 1").get();
  return row ? JSON.parse(row.config_json) : DEFAULT_SETTINGS;
}

export function readSettings() {
  return getSettingsLayer();
}

export function writeSettings(settings, actor = 'local_admin') {
  const now = nowIso();
  const id = randomId('layer');
  db.prepare('INSERT INTO map_layers (id, name, layer_type, config_json, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'System Settings Snapshot', 'system_settings', JSON.stringify(settings), 1, now, now);
  db.prepare('INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomId('audit'), actor, 'settings.update', 'map_layers', id, JSON.stringify({ keys: Object.keys(settings || {}) }), now);
  return settings;
}

export function listProviderUsage(limit = 100) {
  return db.prepare('SELECT * FROM provider_usage ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function listFailedRequests(limit = 100) {
  return db.prepare("SELECT * FROM api_cache WHERE status = 'error' ORDER BY updated_at DESC LIMIT ?").all(limit);
}

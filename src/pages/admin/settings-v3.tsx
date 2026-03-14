import React from 'react';
import { useProviderHealth } from '../../hooks/useProviderHealth';
import { apiBase, fetchJson } from '../../lib/v3Api';

type SettingsState = {
  providerSelection: { geocoderPrimary: string; geocoderFallback: string; routing: string; ai: string };
  limits: { retries: number; timeoutMs: number; cacheTtlSeconds: number };
  dedupeRules: { exactEmail: boolean; normalizedPhone: boolean; nameStreetZip: boolean; householdMerge: boolean };
};

const DEFAULTS: SettingsState = {
  providerSelection: { geocoderPrimary: 'census_geocoder', geocoderFallback: 'nominatim', routing: 'openrouteservice_optional', ai: 'null_ai' },
  limits: { retries: 2, timeoutMs: 12000, cacheTtlSeconds: 86400 },
  dedupeRules: { exactEmail: true, normalizedPhone: true, nameStreetZip: true, householdMerge: true }
};

export default function SettingsV3Page() {
  const { data, error } = useProviderHealth();
  const [settings, setSettings] = React.useState<SettingsState>(DEFAULTS);
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    fetchJson<{ settings: SettingsState }>(`${apiBase()}/settings`).then((resp) => setSettings({ ...DEFAULTS, ...resp.settings })).catch(() => undefined);
  }, []);

  async function saveSettings() {
    setStatus('Saving...');
    await fetchJson(`${apiBase()}/settings`, { method: 'POST', body: JSON.stringify({ settings, actor: 'admin_ui' }) });
    setStatus('Saved');
  }

  return (
    <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>V3 Provider & System Settings</h3>
      <p>Google is optional. Core stack uses Census + ACS + OpenStates + FEC + Overpass with local cache and throttling.</p>
      {error ? <p style={{ color: '#b91c1c' }}>Could not load provider health: {error}</p> : null}
      {data ? <ul>{Object.entries(data).map(([k, v]) => <li key={k}><strong>{k}</strong>: {String(v)}</li>)}</ul> : <p>Loading provider status…</p>}

      <fieldset>
        <legend>Provider selection</legend>
        <label>Primary geocoder <input value={settings.providerSelection.geocoderPrimary} onChange={(e) => setSettings((s) => ({ ...s, providerSelection: { ...s.providerSelection, geocoderPrimary: e.target.value } }))} /></label>
        <label>Fallback geocoder <input value={settings.providerSelection.geocoderFallback} onChange={(e) => setSettings((s) => ({ ...s, providerSelection: { ...s.providerSelection, geocoderFallback: e.target.value } }))} /></label>
      </fieldset>

      <fieldset>
        <legend>Rate/retry/timeout defaults</legend>
        <label>Retries <input type="number" value={settings.limits.retries} onChange={(e) => setSettings((s) => ({ ...s, limits: { ...s.limits, retries: Number(e.target.value) } }))} /></label>
        <label>Timeout ms <input type="number" value={settings.limits.timeoutMs} onChange={(e) => setSettings((s) => ({ ...s, limits: { ...s.limits, timeoutMs: Number(e.target.value) } }))} /></label>
      </fieldset>

      <fieldset>
        <legend>Dedupe defaults</legend>
        {Object.entries(settings.dedupeRules).map(([k, v]) => (
          <label key={k} style={{ marginRight: 12 }}>{k} <input type="checkbox" checked={v} onChange={(e) => setSettings((s) => ({ ...s, dedupeRules: { ...s.dedupeRules, [k]: e.target.checked } }))} /></label>
        ))}
      </fieldset>

      <button onClick={saveSettings}>Save settings</button> <small>{status}</small>
      <p style={{ fontSize: 12, color: '#666' }}>AI can be enabled only for summarization/classification helpers. No per-row enrichment or hidden scoring.</p>
    </section>
  );
}

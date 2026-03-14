import React from 'react';
import { useProviderHealth } from '../../hooks/useProviderHealth';

export default function SettingsV3Page() {
  const { data, error } = useProviderHealth();
  return (
    <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>V3 Provider Settings</h3>
      <p>Google is optional. Primary stack: Census Geocoder + ACS + OpenStates + FEC with local cache and throttling.</p>
      {error ? <p style={{ color: '#b91c1c' }}>Could not load provider health: {error}</p> : null}
      {data ? (
        <ul>
          {Object.entries(data).map(([k, v]) => <li key={k}><strong>{k}</strong>: {v}</li>)}
        </ul>
      ) : <p>Loading provider status…</p>}
      <div>
        <label>AI enabled
          <input type="checkbox" disabled />
        </label>
        <p style={{ fontSize: 12, color: '#666' }}>Enable AI only for summaries/classification assistance; never for mandatory core flows.</p>
      </div>
    </section>
  );
}

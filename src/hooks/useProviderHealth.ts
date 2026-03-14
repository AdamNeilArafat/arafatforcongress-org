import React from 'react';
import { apiBase, fetchJson } from '../lib/v3Api';

type ProviderHealth = Record<string, string>;

export function useProviderHealth() {
  const [data, setData] = React.useState<ProviderHealth | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchJson<ProviderHealth>(`${apiBase()}/providers/health`)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  return { data, error };
}

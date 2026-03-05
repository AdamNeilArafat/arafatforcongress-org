export type GeocodeResult = { lat: number; lng: number; confidence?: number; raw?: unknown };

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodeResult>;
}

function env(name: string, fallback?: string) {
  const viteEnv = (globalThis as any)?.import?.meta?.env?.[name];
  const processEnv = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  return viteEnv ?? processEnv ?? fallback;
}

function hashAddress(address: string) {
  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

export class MockGeocodingProvider implements GeocodingProvider {
  async geocode(address: string): Promise<GeocodeResult> {
    const hash = hashAddress(address.toLowerCase());
    const lat = 25 + (hash % 2400) / 100;
    const lng = -124 + (hash % 5700) / 100;
    return { lat: Math.min(lat, 49.5), lng: Math.min(lng, -66.9), confidence: 0.5, raw: { provider: 'mock', hash } };
  }
}

export class MapboxGeocodingProvider implements GeocodingProvider {
  constructor(private apiKey: string) {}

  async geocode(address: string): Promise<GeocodeResult> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${this.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox geocoding failed with ${response.status}`);
    }
    const payload = await response.json();
    const feature = payload.features?.[0];
    if (!feature?.center || feature.center.length < 2) {
      throw new Error('Mapbox returned no geocoding candidates');
    }
    return {
      lng: Number(feature.center[0]),
      lat: Number(feature.center[1]),
      confidence: typeof feature.relevance === 'number' ? feature.relevance : undefined,
      raw: feature
    };
  }
}

export function createGeocodingProvider(): GeocodingProvider {
  const provider = env('GEOCODER_PROVIDER', 'mock');
  if (provider === 'mapbox') {
    const apiKey = env('GEOCODING_API_KEY');
    if (!apiKey) throw new Error('GEOCODING_API_KEY is required for mapbox geocoder provider');
    return new MapboxGeocodingProvider(apiKey);
  }
  return new MockGeocodingProvider();
}

export function geocodeConfig() {
  return {
    provider: env('GEOCODER_PROVIDER', 'mock') ?? 'mock',
    rateLimitPerSec: Number(env('GEOCODING_RATE_LIMIT_PER_SEC', '5')),
    maxAttempts: Number(env('GEOCODING_MAX_ATTEMPTS', '3')),
    backoffSeconds: Number(env('GEOCODING_BACKOFF_SECONDS', '30'))
  };
}

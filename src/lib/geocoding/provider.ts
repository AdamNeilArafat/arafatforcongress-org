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

export class NominatimLocalProvider implements GeocodingProvider {
  constructor(
    private baseUrl: string,
    private countryCodes: string,
    private userAgent: string,
    private acceptLanguage: string
  ) {}

  async geocode(address: string): Promise<GeocodeResult> {
    const params = new URLSearchParams({
      q: address,
      format: 'jsonv2',
      limit: '1',
      countrycodes: this.countryCodes
    });
    const url = `${this.baseUrl.replace(/\/$/, '')}/search?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept-Language': this.acceptLanguage
      }
    });
    if (!response.ok) {
      throw new Error(`Nominatim local geocoding failed with ${response.status}`);
    }
    const payload = await response.json();
    const first = Array.isArray(payload) ? payload[0] : undefined;
    if (!first?.lat || !first?.lon) {
      throw new Error('Nominatim returned no geocoding candidates');
    }
    return {
      lat: Number(first.lat),
      lng: Number(first.lon),
      confidence: first.importance ? Number(first.importance) : undefined,
      raw: first
    };
  }
}

export function createGeocodingProvider(): GeocodingProvider {
  const provider = env('GEOCODER_PROVIDER', 'nominatim_local');
  if (provider === 'mock') return new MockGeocodingProvider();
  if (provider === 'nominatim_local') {
    return new NominatimLocalProvider(
      env('NOMINATIM_BASE_URL', 'http://localhost:8080') as string,
      env('NOMINATIM_COUNTRYCODES', 'us') as string,
      env('GEOCODER_USER_AGENT', 'afc-dashboard/1.0 (local geocoder)') as string,
      env('GEOCODER_ACCEPT_LANGUAGE', 'en-US') as string
    );
  }
  throw new Error(`Unsupported geocoder provider: ${provider}`);
}

export function geocodeConfig() {
  return {
    provider: env('GEOCODER_PROVIDER', 'nominatim_local') ?? 'nominatim_local',
    rateLimitPerSec: Number(env('GEOCODING_RATE_LIMIT_PER_SEC', '8')),
    maxAttempts: Number(env('GEOCODING_MAX_ATTEMPTS', '3')),
    backoffSeconds: Number(env('GEOCODING_BACKOFF_SECONDS', '30')),
    workerConcurrency: Number(env('GEOCODING_CONCURRENCY', '6'))
  };
}

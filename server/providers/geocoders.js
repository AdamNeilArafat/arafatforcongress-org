import { BaseProvider } from './base.js';
import { fetchWithRetry, throttle } from '../utils/httpClient.js';

function normAddress(input) {
  return [input.line1, input.city, input.state, input.postalCode, input.country || 'US'].filter(Boolean).join(', ');
}

export class CensusGeocoderProvider extends BaseProvider {
  constructor(config = {}) { super('census_geocoder', config); }
  async geocode(address) {
    const operation = 'geocode';
    const cacheKey = this.cacheKey(operation, address);
    const cached = this.cacheGet(cacheKey);
    if (cached) { this.logUsage(operation, 'ok', { cached: true }, 0, 1); return cached; }
    const started = Date.now();
    await throttle(this.name, this.config.rateLimitPerSecond ?? 5);
    const singleLine = encodeURIComponent(normAddress(address));
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${singleLine}&benchmark=2020&format=json`;
    try {
      const response = await fetchWithRetry(url, {}, this.config);
      const data = await response.json();
      const match = data?.result?.addressMatches?.[0];
      const normalized = match ? {
        provider: this.name,
        status: 'matched',
        latitude: match.coordinates?.y,
        longitude: match.coordinates?.x,
        normalizedAddress: match.matchedAddress,
        quality: match.tigerLine?.side ? 0.92 : 0.8,
        districtIds: {},
        raw: match
      } : { provider: this.name, status: 'no_match' };
      this.cachePut(cacheKey, normalized, normalized.status === 'matched' ? 'ok' : 'miss', 60 * 60 * 24 * 14);
      this.logUsage(operation, normalized.status, {}, Date.now() - started);
      return normalized;
    } catch (error) {
      this.logUsage(operation, 'error', { message: String(error) }, Date.now() - started);
      throw error;
    }
  }
}

export class NominatimProvider extends BaseProvider {
  constructor(config = {}) { super('nominatim', config); }
  async geocode(address) {
    const operation = 'geocode';
    const cacheKey = this.cacheKey(operation, address);
    const cached = this.cacheGet(cacheKey);
    if (cached) { this.logUsage(operation, 'ok', { cached: true }, 0, 1); return cached; }
    await throttle(this.name, this.config.rateLimitPerSecond ?? 1);
    const q = encodeURIComponent(normAddress(address));
    const url = `${this.config.baseUrl || 'https://nominatim.openstreetmap.org'}/search?q=${q}&format=jsonv2&addressdetails=1&limit=1`;
    const response = await fetchWithRetry(url, { headers: { 'User-Agent': this.config.userAgent || 'vanguard-field-ops-v3/1.0' } }, this.config);
    const data = await response.json();
    const first = data?.[0];
    const normalized = first ? {
      provider: this.name,
      status: 'matched',
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      normalizedAddress: first.display_name,
      quality: first.importance || 0.6,
      districtIds: {},
      raw: first
    } : { provider: this.name, status: 'no_match' };
    this.cachePut(cacheKey, normalized, normalized.status === 'matched' ? 'ok' : 'miss', 60 * 60 * 24 * 7);
    this.logUsage(operation, normalized.status);
    return normalized;
  }
}

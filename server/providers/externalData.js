import { BaseProvider } from './base.js';
import { fetchWithRetry, throttle } from '../utils/httpClient.js';

function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export class CensusAcsProvider extends BaseProvider {
  constructor(config = {}) { super('census_acs', config); }
  async tractProfile({ state, county, tract, year = 2022 }) {
    const key = this.cacheKey('tractProfile', { state, county, tract, year });
    const cached = this.cacheGet(key);
    if (cached) {
      this.logUsage('tractProfile', 'cache_hit', { state, county, tract, year }, 0, 1);
      return cached;
    }
    await throttle(this.name, this.config.rateLimitPerSecond ?? 5);
    const vars = 'NAME,B01001_001E,B19013_001E,B25077_001E';
    const apiKey = this.config.apiKey ? `&key=${this.config.apiKey}` : '';
    const url = `https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=tract:${tract}&in=state:${state}+county:${county}${apiKey}`;
    const startedAt = Date.now();
    const response = await fetchWithRetry(url, {}, this.config);
    const [header, values] = await response.json();
    const normalized = Object.fromEntries(header.map((h, i) => [h, values[i]]));
    this.cachePut(key, normalized, 'ok', 86400);
    this.logUsage('tractProfile', 'ok', { state, county, tract, year }, Date.now() - startedAt);
    return normalized;
  }
}

export class OpenStatesProvider extends BaseProvider {
  constructor(config = {}) { super('openstates', config); }

  async jurisdictions(stateCode) {
    if (!this.config.apiKey) return [];
    const key = this.cacheKey('jurisdictions', { stateCode });
    const cached = this.cacheGet(key);
    if (cached) return cached;
    await throttle(this.name, this.config.rateLimitPerSecond ?? 2);
    const url = `https://v3.openstates.org/jurisdictions?classification=state&division_id=ocd-division/country:us/state:${stateCode.toLowerCase()}`;
    const response = await fetchWithRetry(url, { headers: { 'X-API-KEY': this.config.apiKey } }, this.config);
    const data = await response.json();
    const normalized = data.results ?? [];
    this.cachePut(key, normalized, 'ok', 86400);
    this.logUsage('jurisdictions', 'ok', { stateCode });
    return normalized;
  }

  async peopleSearch({ jurisdiction, name, page = 1 }) {
    if (!this.config.apiKey) return [];
    const key = this.cacheKey('peopleSearch', { jurisdiction, name, page });
    const cached = this.cacheGet(key);
    if (cached) return cached;

    await throttle(this.name, this.config.rateLimitPerSecond ?? 2);
    const query = toQueryString({ jurisdiction, q: name, page });
    const url = `https://v3.openstates.org/people?${query}`;
    const response = await fetchWithRetry(url, { headers: { 'X-API-KEY': this.config.apiKey } }, this.config);
    const data = await response.json();
    const normalized = (data.results ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      party: person.party,
      current_role: person.current_role,
      district: person.current_role?.district,
      jurisdiction: person.current_role?.jurisdiction?.name,
      updated_at: person.updated_at
    }));
    this.cachePut(key, normalized, 'ok', 21600);
    this.logUsage('peopleSearch', 'ok', { jurisdiction, hasName: Boolean(name), page });
    return normalized;
  }
}

export class FecProvider extends BaseProvider {
  constructor(config = {}) { super('fec', config); }
  async candidatesByState(stateCode, cycle = 2026) {
    if (!this.config.apiKey) return [];
    const key = this.cacheKey('candidatesByState', { stateCode, cycle });
    const cached = this.cacheGet(key);
    if (cached) return cached;
    await throttle(this.name, this.config.rateLimitPerSecond ?? 3);
    const url = `https://api.open.fec.gov/v1/candidates/search/?api_key=${this.config.apiKey}&state=${stateCode}&cycle=${cycle}`;
    const response = await fetchWithRetry(url, {}, this.config);
    const data = await response.json();
    const normalized = data.results ?? [];
    this.cachePut(key, normalized, 'ok', 86400);
    this.logUsage('candidatesByState', 'ok', { stateCode, cycle });
    return normalized;
  }

  async candidateSearch({ name, state, cycle = 2026 }) {
    if (!this.config.apiKey || !name) return [];
    const key = this.cacheKey('candidateSearch', { name, state, cycle });
    const cached = this.cacheGet(key);
    if (cached) return cached;

    await throttle(this.name, this.config.rateLimitPerSecond ?? 3);
    const query = toQueryString({ api_key: this.config.apiKey, name, state, cycle });
    const url = `https://api.open.fec.gov/v1/candidates/search/?${query}`;
    const response = await fetchWithRetry(url, {}, this.config);
    const data = await response.json();
    const normalized = (data.results ?? []).map((candidate) => ({
      candidate_id: candidate.candidate_id,
      name: candidate.name,
      party: candidate.party,
      state: candidate.state,
      incumbent_challenge_full: candidate.incumbent_challenge_full,
      office_full: candidate.office_full
    }));
    this.cachePut(key, normalized, 'ok', 21600);
    this.logUsage('candidateSearch', 'ok', { state, cycle });
    return normalized;
  }
}

export class OverpassProvider extends BaseProvider {
  constructor(config = {}) { super('overpass', config); }

  async nearbyPois({ latitude, longitude, radiusMeters = 800, categories = ['school', 'place_of_worship', 'park', 'bus_stop'] }) {
    const normalizedCategories = Array.isArray(categories) ? categories : String(categories).split(',').map((v) => v.trim()).filter(Boolean);
    const key = this.cacheKey('nearbyPois', { latitude, longitude, radiusMeters, categories: normalizedCategories.sort() });
    const cached = this.cacheGet(key);
    if (cached) return cached;

    await throttle(this.name, this.config.rateLimitPerSecond ?? 1);
    const tagClauses = normalizedCategories.map((category) => `node(around:${radiusMeters},${latitude},${longitude})[\"amenity\"=\"${category}\"];`).join('');
    const query = `[out:json][timeout:25];(${tagClauses});out body;`;
    const response = await fetchWithRetry(this.config.endpoint || 'https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`
    }, this.config);
    const data = await response.json();
    const normalized = (data.elements ?? []).map((element) => ({
      osm_id: element.id,
      type: element.type,
      latitude: element.lat,
      longitude: element.lon,
      category: element.tags?.amenity ?? 'unknown',
      name: element.tags?.name ?? null,
      tags: element.tags ?? {}
    }));

    this.cachePut(key, normalized, 'ok', 21600);
    this.logUsage('nearbyPois', 'ok', { latitude, longitude, radiusMeters, count: normalized.length });
    return normalized;
  }
}

export class GeoNamesProvider extends BaseProvider {
  constructor(config = {}) { super('geonames', config); }

  async searchLocality({ query, country = 'US', maxRows = 10 }) {
    if (!this.config.username || !query) return [];
    const key = this.cacheKey('searchLocality', { query, country, maxRows });
    const cached = this.cacheGet(key);
    if (cached) return cached;

    await throttle(this.name, this.config.rateLimitPerSecond ?? 2);
    const params = toQueryString({ q: query, country, maxRows, username: this.config.username });
    const url = `${this.config.endpoint || 'http://api.geonames.org/searchJSON'}?${params}`;
    const response = await fetchWithRetry(url, {}, this.config);
    const data = await response.json();
    const normalized = (data.geonames ?? []).map((place) => ({
      geoname_id: place.geonameId,
      name: place.name,
      admin_code: place.adminCode1,
      country_code: place.countryCode,
      latitude: Number(place.lat),
      longitude: Number(place.lng),
      population: Number(place.population || 0)
    }));

    this.cachePut(key, normalized, 'ok', 21600);
    this.logUsage('searchLocality', 'ok', { query, country, count: normalized.length });
    return normalized;
  }
}

export class NullAiProvider extends BaseProvider {
  constructor() { super('null_ai', {}); }
  async summarizeNotes(notes) {
    this.logUsage('summarizeNotes', 'disabled');
    return 'AI disabled. Configure an optional AI provider to enable summaries.';
  }
}

export class OptionalGeminiProvider extends BaseProvider {
  constructor(config = {}) { super('gemini_optional', config); }
  async summarizeNotes(notes) {
    if (!this.config.apiKey) return 'Gemini key missing; AI summaries disabled.';
    return `Summary placeholder for ${notes.slice(0, 140)}`;
  }
}

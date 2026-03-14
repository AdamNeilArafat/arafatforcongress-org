import { BaseProvider } from './base.js';
import { AiProvider, DemographicsProvider, FinanceProvider, LegislativeProvider, PlacesProvider } from './interfaces.js';

function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

class ProviderMixin {
  constructor(name, config) {
    this.base = new BaseProvider(name, config);
    this.name = name;
    this.config = config;
  }
  request(...args) { return this.base.request(...args); }
  cacheKey(...args) { return this.base.cacheKey(...args); }
  cacheGet(...args) { return this.base.cacheGet(...args); }
  cachePut(...args) { return this.base.cachePut(...args); }
  logUsage(...args) { return this.base.logUsage(...args); }
}

export class CensusAcsProvider extends DemographicsProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('census_acs', config)); }
  async tractProfile({ state, county, tract, year = 2022 }) {
    const vars = 'NAME,B01001_001E,B19013_001E,B15003_001E,B25003_001E,B08301_001E';
    const apiKey = this.config.apiKey ? `&key=${this.config.apiKey}` : '';
    const url = `https://api.census.gov/data/${year}/acs/acs5?get=${vars}&for=tract:${tract}&in=state:${state}+county:${county}${apiKey}`;
    return this.request({
      operation: 'tractProfile', cachePayload: { state, county, tract, year }, url, ttlSeconds: 21600,
      normalize: (rows) => {
        const row = rows?.[1] || [];
        return {
          year,
          state,
          county,
          tract,
          name: row[0] || null,
          total_population: Number(row[1] || 0),
          median_household_income: Number(row[2] || 0),
          education_attainment_proxy: Number(row[3] || 0),
          housing_tenure_proxy: Number(row[4] || 0),
          commuting_proxy: Number(row[5] || 0)
        };
      }
    });
  }
}

export class OpenStatesProvider extends LegislativeProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('openstates', config)); }
  async jurisdictions(state) {
    if (!this.config.apiKey || !state) return [];
    const url = `https://v3.openstates.org/people?jurisdiction=${encodeURIComponent(state)}`;
    return this.request({
      operation: 'jurisdictions', cachePayload: { state }, ttlSeconds: 21600, url,
      init: { headers: { 'X-API-KEY': this.config.apiKey } },
      normalize: (data) => (data.results || []).map((person) => ({ id: person.id, name: person.name, party: person.party?.[0], district: person.current_role?.district }))
    });
  }
  async peopleSearch({ jurisdiction, name = '', page = 1 }) {
    if (!this.config.apiKey || !jurisdiction) return [];
    const query = toQueryString({ jurisdiction, q: name, page });
    return this.request({
      operation: 'peopleSearch',
      cachePayload: { jurisdiction, name, page },
      url: `https://v3.openstates.org/people?${query}`,
      init: { headers: { 'X-API-KEY': this.config.apiKey } },
      ttlSeconds: 21600,
      normalize: (data) => data.results || []
    });
  }
}

export class FecProvider extends FinanceProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('fec', config)); }
  async candidateSearch({ name, state, cycle = 2026 }) {
    if (!this.config.apiKey || !name) return [];
    const query = toQueryString({ name, state, cycle, api_key: this.config.apiKey, per_page: 20 });
    return this.request({
      operation: 'candidateSearch',
      cachePayload: { name, state, cycle },
      url: `https://api.open.fec.gov/v1/candidates/search?${query}`,
      ttlSeconds: 21600,
      normalize: (data) => (data.results || []).map((candidate) => ({
        name: candidate.name,
        candidate_id: candidate.candidate_id,
        party: candidate.party_full,
        office: candidate.office_full
      }))
    });
  }
  async candidatesByState(state, cycle = 2026) { return this.candidateSearch({ name: '', state, cycle }); }
}

export class OverpassProvider extends PlacesProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('overpass', config)); }
  async nearbyPois({ latitude, longitude, radiusMeters = 800, categories = ['school', 'place_of_worship', 'park', 'bus_stop'] }) {
    const normalizedCategories = Array.isArray(categories) ? categories : String(categories).split(',').map((v) => v.trim()).filter(Boolean);
    const tagClauses = normalizedCategories.map((category) => `node(around:${radiusMeters},${latitude},${longitude})[\"amenity\"=\"${category}\"];`).join('');
    const query = `[out:json][timeout:25];(${tagClauses});out body;`;
    return this.request({
      operation: 'nearbyPois',
      cachePayload: { latitude, longitude, radiusMeters, categories: normalizedCategories.sort() },
      url: this.config.endpoint || 'https://overpass-api.de/api/interpreter',
      init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` },
      ttlSeconds: 21600,
      normalize: (data) => (data.elements || []).map((element) => ({ osm_id: element.id, latitude: element.lat, longitude: element.lon, category: element.tags?.amenity ?? 'unknown', name: element.tags?.name ?? null, tags: element.tags || {} }))
    });
  }
}

export class GeoNamesProvider extends PlacesProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('geonames', config)); }
  async searchLocality({ query, country = 'US', maxRows = 10 }) {
    if (!this.config.username || !query) return [];
    const params = toQueryString({ q: query, country, maxRows, username: this.config.username });
    return this.request({
      operation: 'searchLocality',
      cachePayload: { query, country, maxRows },
      url: `${this.config.endpoint || 'http://api.geonames.org/searchJSON'}?${params}`,
      ttlSeconds: 21600,
      normalize: (data) => (data.geonames || []).map((place) => ({ geoname_id: place.geonameId, name: place.name, admin_code: place.adminCode1, country_code: place.countryCode, latitude: Number(place.lat), longitude: Number(place.lng), population: Number(place.population || 0) }))
    });
  }
}

export class NullAiProvider extends AiProvider {
  constructor() { super(); Object.assign(this, new ProviderMixin('null_ai', {})); }
  async summarizeNotes() { this.logUsage('summarizeNotes', 'disabled'); return 'AI disabled. Configure an optional AI provider to enable summaries.'; }
}

export class OptionalGeminiProvider extends AiProvider {
  constructor(config = {}) { super(); Object.assign(this, new ProviderMixin('gemini_optional', config)); }
  async summarizeNotes(notes) {
    if (!this.config.apiKey) return 'Gemini key missing; AI summaries disabled.';
    this.logUsage('summarizeNotes', 'ok', { approxChars: notes.length });
    return `Summary placeholder for ${notes.slice(0, 140)}`;
  }
}

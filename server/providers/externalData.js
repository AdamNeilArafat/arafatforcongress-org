import { BaseProvider } from './base.js';
import { fetchWithRetry, throttle } from '../utils/httpClient.js';

export class CensusAcsProvider extends BaseProvider {
  constructor(config = {}) { super('census_acs', config); }
  async tractProfile({ state, county, tract }) {
    const key = this.cacheKey('tractProfile', { state, county, tract });
    const cached = this.cacheGet(key);
    if (cached) return cached;
    await throttle(this.name, this.config.rateLimitPerSecond ?? 5);
    const vars = 'B01001_001E,B19013_001E,B25077_001E';
    const apiKey = this.config.apiKey ? `&key=${this.config.apiKey}` : '';
    const url = `https://api.census.gov/data/2022/acs/acs5?get=${vars}&for=tract:${tract}&in=state:${state}+county:${county}${apiKey}`;
    const response = await fetchWithRetry(url, {}, this.config);
    const [header, values] = await response.json();
    const normalized = Object.fromEntries(header.map((h, i) => [h, values[i]]));
    this.cachePut(key, normalized, 'ok', 86400);
    this.logUsage('tractProfile', 'ok');
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
    this.cachePut(key, data.results ?? [], 'ok', 86400);
    this.logUsage('jurisdictions', 'ok');
    return data.results ?? [];
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
    this.cachePut(key, data.results ?? [], 'ok', 86400);
    this.logUsage('candidatesByState', 'ok');
    return data.results ?? [];
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

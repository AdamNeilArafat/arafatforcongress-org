import { db, nowIso, randomId } from '../db/index.js';
import { fetchWithRetry, throttle } from '../utils/httpClient.js';
import { ProviderError } from './interfaces.js';

export class BaseProvider {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
  }

  cacheKey(operation, payload) {
    return `${this.name}:${operation}:${JSON.stringify(payload)}`;
  }

  cacheGet(cacheKey) {
    const row = db.prepare('SELECT * FROM api_cache WHERE cache_key = ?').get(cacheKey);
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    return row.value_json ? JSON.parse(row.value_json) : null;
  }

  cachePut(cacheKey, value, status = 'ok', ttlSeconds = 86400) {
    const now = nowIso();
    const expires = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    db.prepare(`INSERT INTO api_cache (id, cache_key, provider, value_json, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json,status=excluded.status,expires_at=excluded.expires_at,updated_at=excluded.updated_at`)
      .run(randomId('cache'), cacheKey, this.name, JSON.stringify(value), status, expires, now, now);
  }

  logUsage(operation, status, detail = {}, latencyMs = null, cacheHit = 0) {
    db.prepare('INSERT INTO provider_usage (id, provider, operation, status, latency_ms, cache_hit, detail_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomId('usage'), this.name, operation, status, latencyMs, cacheHit, JSON.stringify(detail), nowIso());
  }

  async request({ operation, cachePayload, url, init = {}, ttlSeconds = 86400, normalize, statusForValue = () => 'ok' }) {
    const cacheKey = this.cacheKey(operation, cachePayload);
    const cached = this.cacheGet(cacheKey);
    if (cached) {
      this.logUsage(operation, 'ok', { cached: true }, 0, 1);
      return cached;
    }

    const started = Date.now();
    try {
      await throttle(this.name, this.config.rateLimitPerSecond ?? 2);
      const response = await fetchWithRetry(url, init, this.config);
      const raw = await response.json();
      const normalized = normalize(raw);
      this.cachePut(cacheKey, normalized, statusForValue(normalized), ttlSeconds);
      this.logUsage(operation, statusForValue(normalized), {}, Date.now() - started, 0);
      return normalized;
    } catch (error) {
      const providerError = error instanceof ProviderError
        ? error
        : new ProviderError(this.name, operation, 'request_failed', String(error), { url });
      this.cachePut(cacheKey, providerError.toJSON(), 'error', Math.min(3600, ttlSeconds));
      this.logUsage(operation, 'error', providerError.toJSON(), Date.now() - started, 0);
      throw providerError;
    }
  }
}

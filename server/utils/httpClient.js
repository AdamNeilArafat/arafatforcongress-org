export async function fetchWithRetry(url, options = {}, cfg = {}) {
  const retries = cfg.retries ?? 2;
  const timeoutMs = cfg.timeoutMs ?? 10000;
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise((r) => setTimeout(r, (cfg.backoffMs ?? 500) * (i + 1)));
    }
  }
  throw lastErr;
}

const lane = new Map();
export async function throttle(key, perSecond = 4) {
  const interval = Math.max(1, Math.floor(1000 / perSecond));
  const next = lane.get(key) ?? 0;
  const wait = Math.max(0, next - Date.now());
  lane.set(key, Date.now() + wait + interval);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

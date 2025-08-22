export const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, Number(n) || 0));
export const pct = (n) => Math.round(clamp(n) * 100);
export const pctStr = (n) => `${pct(n)}%`;
export const money = (n) => "$" + (Math.round(Number(n) || 0)).toLocaleString();
export const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);
export const avg = (arr) => (arr.length ? (sum(arr) / arr.length) : 0);

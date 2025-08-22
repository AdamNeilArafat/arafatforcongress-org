// /assets/js/formatters.js

export const clamp = (n, min = 0, max = 1) => Math.min(max, Math.max(min, Number(n) || 0));

export const pct = (n) => Math.round(clamp(n) * 100); // 0..1 → 0..100 integer
export const pctStr = (n) => `${pct(n)}%`;

export const money = (n) => "$" + (Math.round(Number(n) || 0)).toLocaleString();
export const num = (n) => (Number(n) || 0);
export const sum = (arr) => arr.reduce((s, v) => s + (Number(v) || 0), 0);
export const avg = (arr) => (arr.length ? (sum(arr) / arr.length) : 0);

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

/** Shallow object sum by keys: add objB into objA */
export function sumInto(objA, objB) {
  for (const [k, v] of Object.entries(objB || {})) objA[k] = (objA[k] || 0) + (Number(v) || 0);
  return objA;
}

/** Sort object entries by value descending */
export function topEntry(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return ["—", 0];
  entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  return entries[0];
}

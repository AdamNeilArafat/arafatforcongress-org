import fs from "node:fs/promises";
import path from "node:path";

export const API = "https://api.open.fec.gov/v1";
const KEY = process.env.FEC_API_KEY || "";

function redact(k){ return k ? `${k.slice(0,4)}…${k.slice(-4)}` : "(none)"; }

export async function preflight() {
  if (!KEY || KEY.length < 20) {
    throw new Error(`Missing/invalid FEC_API_KEY. Saw: ${redact(KEY)}\nAdd it in GitHub > Settings > Secrets and variables > Actions.`);
  }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

export async function writeJSON(file, obj) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}

export async function readJSON(file, fallback = null) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

export async function appendNDJSON(file, rows) {
  if (!rows?.length) return;
  await ensureDir(path.dirname(file));
  const lines = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  await fs.appendFile(file, lines);
}

export function ymd(d = new Date(), tz = "UTC") {
  // Return YYYY-MM-DD in the desired timezone without extra deps
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d).reduce((a,p) => (a[p.type]=p.value, a), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Simple fetch with built-in key and Accept header; supports URL or string + params
export async function getJSON(input) {
  // Accept URL instance or string; always append api_key
  const u = input instanceof URL ? input : new URL(String(input));
  u.searchParams.set("api_key", process.env.FEC_API_KEY || "");
  const res = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status} for ${u.toString()}\n${text}`);
  }
  return res.json();
}

// Paged fetch (page=1..N). Use for aggregate endpoints; caps pages to avoid runaway jobs
export async function collectPaged(endpoint, baseParams = {}, maxPages = 50, perPage = 100) {
  let page = 1, all = [];
  while (page <= maxPages) {
    const data = await getJSON(endpoint, { ...baseParams, page, per_page: perPage });
    const chunk = data?.results ?? [];
    all.push(...chunk);
    const pages = data?.pagination?.pages ?? 1;
    if (page >= pages) break;
    page++;
    await sleep(250); // polite
  }
  return all;
}

// Cursor file for incremental pulls
const CURSOR_FILE = ".fec-cursors.json";

export async function readCursors() {
  return (await readJSON(CURSOR_FILE, {})) ?? {};
}
export async function writeCursors(c) {
  await writeJSON(CURSOR_FILE, c);
}

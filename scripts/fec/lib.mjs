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

export function ymd(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}

// Simple fetch with built-in key and Accept header; supports URL or string + params
export async function getJSON(endpoint, params = {}) {
  const url = new URL(
    endpoint.startsWith("http") ? endpoint : `${API}${endpoint}`
  );
  // Add query params
  Object.entries(params).forEach(([k,v]) => {
    if (Array.isArray(v)) v.forEach(x => url.searchParams.append(k, x));
    else if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });
  url.searchParams.set("api_key", KEY);
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}\n${text}`);
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

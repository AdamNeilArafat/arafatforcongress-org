import fs from "node:fs/promises";
import path from "node:path";
import { preflight, ensureDir, ymd, getJSON, readJSON, appendNDJSON, collectPaged, sleep } from "./lib.mjs";


const BURST_SLEEP_MS = Number(process.env.FEC_BURST_SLEEP_MS || 1200); // ~50/min
const MAX_RETRIES = Number(process.env.FEC_MAX_RETRIES || 5);

async function getJSONWithBackoff(url) {
  let lastErr;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await getJSONWithBackoff(url); // call the real getter
    } catch (e) {
      lastErr = e;
      const msg = String((e && (e.message || e)) || '');
      const is429 = msg.includes('429') || (e && e.code === 429);
      if (!is429) throw e;
      const wait = Math.min(60000, (i + 1) * 5000); // 5s,10s,... cap 60s
      console.warn(`[fec] 429 rate limit; retry ${i+1}/${MAX_RETRIES} after ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}
await preflight();

const cfg = (await readJSON("config/fec-targets.json", {})) || {};
const today = ymd(new Date(), cfg.timezone || "UTC");
const RAW_DIR = path.join("data", "raw", today);
await ensureDir(RAW_DIR);

const cycles = Array.isArray(cfg.cycles) && cfg.cycles.length ? cfg.cycles : [2026];
const committeeIds = Array.isArray(cfg.committee_ids) ? cfg.committee_ids.filter(Boolean) : [];

if (!committeeIds.length) {
  console.log("[fec] fetch-receipts: no committee_ids; nothing to do");
  process.exit(0);
}

async function fetchScheduleA(committeeId, cycle) {
  const base = new URL("https://api.open.fec.gov/v1/schedules/schedule_a/");
  base.searchParams.set("committee_id", committeeId);
  base.searchParams.set("two_year_transaction_period", String(cycle));
  base.searchParams.set("per_page", "100");
  const rows = await collectPaged(base);
  if (!rows.length) return 0;
  await appendNDJSON(path.join(RAW_DIR, `receipts_${committeeId}_${cycle}.ndjson`), rows);
  return rows.length;
}

for (const cycle of cycles) {
  for (const cmte of committeeIds) {
    try {
      const n = await fetchScheduleA(cmte, cycle);
      console.log(`[fec] receipts: ${cmte} ${cycle} -> ${n} rows`);
      await sleep(80);
    } catch (e) {
      console.warn(`[fec] receipts error (${cmte} ${cycle}):`, e?.message || e);
    }
  }
}

console.log("fetch-receipts complete →", RAW_DIR);

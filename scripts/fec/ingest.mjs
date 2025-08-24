import fs from "node:fs/promises";
import path from "node:path";
import {
  preflight,
  ensureDir,
  appendNDJSON,
  ymd,
  getJSON,
  collectPaged,
  readJSON,
  readCursors,
  writeCursors,
  sleep
} from "./lib.mjs";

await preflight();

const cfg = (await readJSON("config/fec-targets.json", {})) || {};
const today = ymd(new Date(), cfg.timezone || "UTC");
const RAW_DIR = path.join("data", "raw", today);

await ensureDir(RAW_DIR);

const cycles = Array.isArray(cfg.cycles) && cfg.cycles.length ? cfg.cycles : [2026];
const candidateIds = Array.isArray(cfg.candidate_ids) ? cfg.candidate_ids.filter(Boolean) : [];
const committeeIds = Array.isArray(cfg.committee_ids) ? cfg.committee_ids.filter(Boolean) : [];

console.log("[fec] cfg:", { cycles, candidateIds, committeeIds, timezone: cfg.timezone });

if (!candidateIds.length && !committeeIds.length) {
  console.log("[fec] No candidate/committee IDs in config; nothing to fetch. Ingest complete →", RAW_DIR);
  process.exit(0);
}

async function existsCommittee(id) {
  try {
    const u = new URL(`https://api.open.fec.gov/v1/committee/${id}/`);
    u.searchParams.set("api_key", process.env.FEC_API_KEY);
    const j = await getJSON(u);
    return Array.isArray(j?.results) && j.results.length > 0;
  } catch {
    return false;
  }
}

async function existsCandidate(id) {
  try {
    const u = new URL(`https://api.open.fec.gov/v1/candidate/${id}/`);
    u.searchParams.set("api_key", process.env.FEC_API_KEY);
    const j = await getJSON(u);
    return Array.isArray(j?.results) && j.results.length > 0;
  } catch {
    return false;
  }
}

async function pullCommitteeReports(id, cycle) {
  const base = new URL(`https://api.open.fec.gov/v1/committee/${id}/reports/`);
  base.searchParams.set("two_year_transaction_period", String(cycle));
  base.searchParams.set("per_page", "100");
  const data = await getJSON(base);
  await appendNDJSON(`${RAW_DIR}/committee_reports_${id}_${cycle}.ndjson`, data.results || []);
}

async function pullCandidateHistory(id, cycle) {
  const base = new URL(`https://api.open.fec.gov/v1/candidate/${id}/history/`);
  base.searchParams.set("cycle", String(cycle));
  base.searchParams.set("per_page", "100");
  const data = await getJSON(base);
  await appendNDJSON(`${RAW_DIR}/candidate_history_${id}_${cycle}.ndjson`, data.results || []);
}

for (const cycle of cycles) {
  for (const cid of candidateIds) {
    try {
      const ok = await existsCandidate(cid);
      if (!ok) {
        console.warn(`[fec] skip: candidate ${cid} not found`);
        continue;
      }
      console.log(`[fec] candidate ${cid} : cycle ${cycle}`);
      await pullCandidateHistory(cid, cycle);
      await sleep(80);
    } catch (e) {
      console.warn(`candidate pull error (${cid} ${cycle}):`, e?.message || e);
    }
  }

  for (const cmte of committeeIds) {
    try {
      const ok = await existsCommittee(cmte);
      if (!ok) {
        console.warn(`[fec] skip: committee ${cmte} not found`);
        continue;
      }
      console.log(`[fec] committee ${cmte} : cycle ${cycle}`);
      await pullCommitteeReports(cmte, cycle);
      await sleep(80);
    } catch (e) {
      console.warn(`committee pull error (${cmte} ${cycle}):`, e?.message || e);
    }
  }
}

console.log("Ingest complete →", RAW_DIR);

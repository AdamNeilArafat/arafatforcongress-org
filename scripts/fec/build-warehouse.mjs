import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureDir, readJSON, writeJSON } from "./lib.mjs";

const RAW_ROOT = "data/raw";
const WH_DIR = "data/warehouse";

async function latestRawDirOrCreateToday() {
  // First try to use the latest existing YYYY-MM-DD folder
  try {
    const entries = await fs.readdir(RAW_ROOT, { withFileTypes: true });
    const dates = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort();
    if (dates.length) {
      const last = dates[dates.length - 1];
      console.warn(`[warehouse] Using latest available raw dir: ${last}`);
      return path.join(RAW_ROOT, last);
    }
  } catch {
    // ignore; we'll create RAW_ROOT/today below if needed
  }

  // No raw dirs at all → create a “today” folder (UTC) so we don’t crash
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const todayDir = path.join(RAW_ROOT, `${yyyy}-${mm}-${dd}`);
  await fs.mkdir(todayDir, { recursive: true });
  console.warn(`[warehouse] No raw data found; created empty ${todayDir}`);
  return todayDir;
}

async function readNDJSON(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return txt.trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch { return []; }
}

async function collectCommitteeReports(rawDir) {
  let files = [];
  try {
    files = (await fs.readdir(rawDir)).filter(
      f => f.startsWith("committee_") && f.includes("_reports_")
    );
  } catch {
    files = [];
  }
  const rows = [];
  for (const f of files) rows.push(...await readNDJSON(path.join(rawDir, f)));
  return rows;
}

// kept for compatibility if referenced elsewhere
function sum(arr, f) { return arr.reduce((a, b) => a + (f(b) || 0), 0); }

async function buildDimsAndFacts() {
  await ensureDir(WH_DIR);

  const RAW_DIR = await latestRawDirOrCreateToday();

  const candidates = await readNDJSON(path.join(RAW_DIR, "candidates.ndjson"));
  const committees = await readNDJSON(path.join(RAW_DIR, "committees.ndjson"));
  const reports = await collectCommitteeReports(RAW_DIR);

  await writeJSON(path.join(WH_DIR, "dim_candidates.jsonl"), candidates);
  await writeJSON(path.join(WH_DIR, "dim_committees.jsonl"), committees);
  await writeJSON(path.join(WH_DIR, "committee_reports.jsonl"), reports);

  const names = await fs.readdir(RAW_DIR).catch(() => []);

  // Receipts aggregates (size/state/employer/zip) -> quick rollups
  const aggFiles = names.filter(f => /^sa_.*(by_size|by_state|by_employer|by_zip)\.ndjson$/.test(f));
  const aggs = [];
  for (const f of aggFiles) aggs.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_receipts_aggregates.jsonl"), aggs);

  // Disbursements + Vendors
  const sbFiles = names.filter(f => f.startsWith("sb_"));
  const disb = [];
  for (const f of sbFiles) disb.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_disbursements.jsonl"), disb);

  // Vendors top-line
  const byVendor = {};
  for (const r of disb) {
    const key = (r.payee_name || "").toUpperCase().trim();
    if (!key) continue;
    byVendor[key] = (byVendor[key] || 0) + (r.disbursement_amount || 0);
  }
  const vendorIdx = Object.entries(byVendor)
    .map(([vendor, amount]) => ({ vendor, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 500);
  await writeJSON(path.join(WH_DIR, "vendor_index.jsonl"), vendorIdx);

  // IE fact
  const seFiles = names.filter(f => f.startsWith("se_"));
  const ies = [];
  for (const f of seFiles) ies.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_ie.jsonl"), ies);
}

await buildDimsAndFacts();
console.log("Warehouse built →", WH_DIR);

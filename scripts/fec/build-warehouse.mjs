import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureDir, ymd, readJSON, writeJSON } from "./lib.mjs";

const RAW_ROOT = "data/raw";
const WH_DIR = "data/warehouse";

async function getRawDir() {
  // Use the same timezone as ingest (from config), default UTC if missing
  const cfg = (await readJSON("config/fec-targets.json", {})) || {};
  const tz = cfg.timezone || "UTC";

  const today = ymd(new Date(), tz);
  const todayDir = path.join(RAW_ROOT, today);
  if (existsSync(todayDir)) return todayDir;

  // Fallback: use the most recent YYYY-MM-DD directory under data/raw
  try {
    const entries = await fs.readdir(RAW_ROOT, { withFileTypes: true });
    const dates = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort(); // lexical sort works for YYYY-MM-DD
    if (dates.length) {
      const last = dates[dates.length - 1];
      console.warn(`[warehouse] RAW dir for ${today} missing; using latest available: ${last}`);
      return path.join(RAW_ROOT, last);
    }
  } catch {
    // ignore; handled by creating empty dir below
  }

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

// Collect reports for cash-on-hand & receipts
async function collectCommitteeReports(rawDir) {
  const files = (await fs.readdir(rawDir)).filter(
    f => f.startsWith("committee_") && f.includes("_reports_")
  );
  const rows = [];
  for (const f of files) rows.push(...await readNDJSON(path.join(rawDir, f)));
  return rows;
}

function sum(arr, f) { return arr.reduce((a, b) => a + (f(b) || 0), 0); }

async function buildDimsAndFacts() {
  await ensureDir(WH_DIR);

  const RAW_DIR = await getRawDir();

  const candidates = await readNDJSON(path.join(RAW_DIR, "candidates.ndjson"));
  const committees = await readNDJSON(path.join(RAW_DIR, "committees.ndjson"));
  const reports = await collectCommitteeReports(RAW_DIR);

  await writeJSON(path.join(WH_DIR, "dim_candidates.jsonl"), candidates);
  await writeJSON(path.join(WH_DIR, "dim_committees.jsonl"), committees);
  await writeJSON(path.join(WH_DIR, "committee_reports.jsonl"), reports);

  // Receipts aggregates (size/state/employer) -> quick rollups
  const aggFiles = (await fs.readdir(RAW_DIR)).filter(
    f => /^sa_.*(by_size|by_state|by_employer|by_zip)\.ndjson$/.test(f)
  );
  const aggs = [];
  for (const f of aggFiles) aggs.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_receipts_aggregates.jsonl"), aggs);

  // Disbursements + Vendors
  const sbFiles = (await fs.readdir(RAW_DIR)).filter(f => f.startsWith("sb_"));
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
  const seFiles = (await fs.readdir(RAW_DIR)).filter(f => f.startsWith("se_"));
  const ies = [];
  for (const f of seFiles) ies.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_ie.jsonl"), ies);
}

await buildDimsAndFacts();
console.log("Warehouse built →", WH_DIR);

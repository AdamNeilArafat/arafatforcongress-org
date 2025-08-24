import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, ymd, readJSON, writeJSON } from "./lib.mjs";

const today = ymd();
const RAW_DIR = `data/raw/${today}`;
const WH_DIR = `data/warehouse`;

async function readNDJSON(file) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return txt.trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch { return []; }
}

// Collect reports for cash-on-hand & receipts
async function collectCommitteeReports() {
  const files = (await fs.readdir(RAW_DIR)).filter(f => f.startsWith("committee_") && f.includes("_reports_"));
  const rows = [];
  for (const f of files) rows.push(...await readNDJSON(path.join(RAW_DIR, f)));
  return rows;
}

function sum(arr, f) { return arr.reduce((a,b)=>a + (f(b)||0), 0); }

async function buildDimsAndFacts() {
  await ensureDir(WH_DIR);

  const candidates = await readNDJSON(path.join(RAW_DIR, "candidates.ndjson"));
  const committees = await readNDJSON(path.join(RAW_DIR, "committees.ndjson"));
  const reports = await collectCommitteeReports();

  await writeJSON(path.join(WH_DIR, "dim_candidates.jsonl"), candidates);
  await writeJSON(path.join(WH_DIR, "dim_committees.jsonl"), committees);
  await writeJSON(path.join(WH_DIR, "committee_reports.jsonl"), reports);

  // Receipts aggregates (size/state/employer) -> quick rollups
  const aggFiles = (await fs.readdir(RAW_DIR)).filter(f => /^sa_.*(by_size|by_state|by_employer|by_zip)\.ndjson$/.test(f));
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
  const vendorIdx = Object.entries(byVendor).map(([vendor, amount]) => ({ vendor, amount }))
    .sort((a,b)=>b.amount-a.amount).slice(0, 500);
  await writeJSON(path.join(WH_DIR, "vendor_index.jsonl"), vendorIdx);

  // IE fact
  const seFiles = (await fs.readdir(RAW_DIR)).filter(f => f.startsWith("se_"));
  const ies = [];
  for (const f of seFiles) ies.push(...await readNDJSON(path.join(RAW_DIR, f)));
  await writeJSON(path.join(WH_DIR, "fact_ie.jsonl"), ies);
}

await buildDimsAndFacts();
console.log("Warehouse built →", WH_DIR);

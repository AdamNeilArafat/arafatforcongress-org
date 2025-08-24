import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJSON, readJSON, ymd } from "./lib.mjs";

const today = ymd();
const WH_DIR = "data/warehouse";
const SITE_DIR = "data/site";
const cfg = await readJSON("config/fec-targets.json");

function sum(arr, f){ return arr.reduce((a,b)=>a + (f(b)||0), 0); }

async function load(file){ return (await readJSON(path.join(WH_DIR, file), [])); }

function groupSum(arr, key, val) {
  const m = new Map();
  for (const r of arr) {
    const k = r[key] ?? "";
    const v = Number(r[val] ?? 0);
    m.set(k, (m.get(k) || 0) + v);
  }
  return [...m.entries()].map(([k,v])=>({[key]:k, [val]:v}));
}

async function run() {
  const candidates = cfg.candidate_ids?.filter(Boolean) ?? [];
  const committees = cfg.committee_ids?.filter(Boolean) ?? [];
  if (!candidates.length && !committees.length) {
    console.log("No candidates/committees configured. Edit config/fec-targets.json");
    return;
  }

  const reports = await load("committee_reports.jsonl");
  const aggs = await load("fact_receipts_aggregates.jsonl");
  const disb = await load("fact_disbursements.jsonl");
  const vendors = await load("vendor_index.jsonl");
  const ies = await load("fact_ie.jsonl");

  // We publish per-candidate bundles. If you only have committee IDs, compute over those.
  for (const cand of candidates.length ? candidates : ["_unknown_"]) {
    const targetComms = committees; // keep simple: user listed authorized committees here.

    // Reports → most recent totals
    const recent = reports
      .filter(r => !targetComms.length || targetComms.includes(r.committee_id))
      .sort((a,b)=> new Date(b.coverage_end_date??b.coverage_through_date||"") - new Date(a.coverage_end_date??a.coverage_through_date||""));
    const latest = recent[0] || {};

    // Aggregates → small donor share & geography
    const aBySize = aggs.filter(r => r.size ?? r.size_label); // any size rows
    const sizeTotal = sum(aBySize, r => r.total || r.total_amount || 0);
    const small = aBySize.filter(r => {
      const label = (r.size || r.size_label || "").toString().toLowerCase();
      return label.includes("<") || label.includes("0-199");
    });
    const smallAmt = sum(small, r => r.total || r.total_amount || 0);

    const aByState = aggs.filter(r => r.state);
    const byState = groupSum(aByState, "state", "total").sort((a,b)=>b.total-a.total).slice(0, 60);

    const aByEmployer = aggs.filter(r => r.employer);
    const byEmployer = groupSum(aByEmployer, "employer", "total").sort((a,b)=>b.total-a.total).slice(0, 50);

    // Vendors (top 50)
    const topVendors = vendors.slice(0, 50);

    // IEs for/against this candidate (if configured)
    const myIEs = ies.filter(r => !candidates.length || r.candidate_id === cand);
    const ieFor = sum(myIEs.filter(r => (r.support_oppose_indicator||"").toUpperCase()==="S"), r => r.expenditure_amount||0);
    const ieAgainst = sum(myIEs.filter(r => (r.support_oppose_indicator||"").toUpperCase()==="O"), r => r.expenditure_amount||0);

    const summary = {
      cycle: Math.max(...(cfg.cycles||[2024])),
      cash_on_hand: Number(latest.cash_on_hand_end_period || latest.ending_cash_on_hand || 0),
      debt: Number(latest.debts_owed_by_committee || 0),
      total_receipts: Number(latest.total_receipts || latest.receipts || 0),
      total_disbursements: Number(latest.total_disbursements || latest.disbursements || 0),
      small_donor_share: sizeTotal ? smallAmt/sizeTotal : null,
      pac_share: latest.contributions_from_other_political_committees ? Number(latest.contributions_from_other_political_committees)/(Number(latest.total_receipts||0)||1) : null,
      in_state_share: null,  // you can compute if you filter by state later
      outside_spend_for: ieFor,
      outside_spend_against: ieAgainst,
      updated_at: new Date().toISOString()
    };

    const base = path.join(SITE_DIR, "candidates", cand);
    await ensureDir(base);
    await writeJSON(path.join(base, "summary.json"), summary);
    await writeJSON(path.join(base, "donors-by-state.json"), byState);
    await writeJSON(path.join(base, "top-employers.json"), byEmployer);
    await writeJSON(path.join(base, "top-vendors.json"), topVendors);
    await writeJSON(path.join(base, "outside-spend-for-against.json"), [
      { side: "for", amount: ieFor },
      { side: "against", amount: ieAgainst }
    ]);
  }
  console.log("Site bundles →", SITE_DIR);
}

await run();

// scripts/fec/build-site-bundles.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { preflight, ensureDir, readJSON, ymd, getJSON } from "./lib.mjs";

// ---- config / setup --------------------------------------------------------
const cfg = (await readJSON("config/fec-targets.json", {})) || {};
const cycles = Array.isArray(cfg.cycles) && cfg.cycles.length ? cfg.cycles : [2026];
const today = ymd(new Date(), cfg.timezone || "UTC");
const SITE_DIR = path.join("data", "site");
await ensureDir(SITE_DIR);

// Only enforce preflight if not explicitly skipped (local-only mode)
const SKIP = !!process.env.SKIP_FEC_PREFLIGHT;
if (!SKIP) {
  await preflight();
}

// Load warehouse metrics. Accept either array or object keyed by committee_id.
const wh = (await readJSON("data/warehouse/committee_metrics.json", [])) || [];
const metrics = Array.isArray(wh) ? wh : Object.values(wh);

// ---- helpers ---------------------------------------------------------------
async function getCandidateCommitteesOnline(candidateId, cycle) {
  const u = new URL(`https://api.open.fec.gov/v1/candidate/${candidateId}/committees/`);
  u.searchParams.set("cycle", String(cycle));
  u.searchParams.set("per_page", "100");
  const j = await getJSON(u);
  return Array.from(new Set((j?.results || []).map(r => r.committee_id))).filter(Boolean);
}

// Optional offline fallback: allow mapping in config/fec-targets.json
// {
//   "candidate_ids": ["H0..."],
//   "candidate_committees": {
//     "H0...": { "2026": ["C00...", "C00..."] }
//   }
// }
async function getCandidateCommittees(candidateId, cycle) {
  if (!SKIP) {
    return getCandidateCommitteesOnline(candidateId, cycle);
  }
  const byCand = cfg.candidate_committees || {};
  const byCycle = byCand[candidateId] || {};
  const arr = byCycle[String(cycle)] || byCycle[Number(cycle)] || [];
  return Array.from(new Set(arr)).filter(Boolean);
}

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round(n, p = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return v;
  return Number(v.toFixed(p));
}

function badgeEval(m) {
  const badges = [];
  if (safeNum(m.share_small_individual, 0) >= 0.50)
    badges.push({ key: "small_dollar_powered", label: "Small-Dollar Powered", reason: `Small individual share ${(m.share_small_individual*100).toFixed(1)}%` });
  if (safeNum(m.share_committee, 0) >= 0.30)
    badges.push({ key: "corporate_pac_reliant", label: "Corporate PAC Reliant", reason: `Committee/PAC share ${(m.share_committee*100).toFixed(1)}%` });

  const t = (k) => round(safeNum((m.tags?.[k]), 0), 2);
  if (t("aipac")  > 0) badges.push({ key:"aipac_money",   label:"AIPAC-linked Money",       reason:`$${t("aipac").toLocaleString()}` });
  if (t("defense")> 0) badges.push({ key:"defense_money", label:"Defense Contractor Money", reason:`$${t("defense").toLocaleString()}` });
  if (t("fossil") > 0) badges.push({ key:"fossil_money",  label:"Fossil Fuel Money",        reason:`$${t("fossil").toLocaleString()}` });
  if (t("pharma") > 0) badges.push({ key:"pharma_money",  label:"Pharma Money",             reason:`$${t("pharma").toLocaleString()}` });
  if (t("tech")   > 0) badges.push({ key:"tech_money",    label:"Big Tech Money",           reason:`$${t("tech").toLocaleString()}` });

  if (Number.isFinite(m.burn_rate_ytd) && m.burn_rate_ytd > 1.0)
    badges.push({ key:"burn_rate_high", label:"High Burn Rate", reason:`${(m.burn_rate_ytd*100).toFixed(0)}% of receipts` });

  if (safeNum(m.cash_on_hand_end, 0) > 0 && m.cash_on_hand_end < 100000)
    badges.push({ key:"low_cash_on_hand", label:"Low Cash on Hand", reason:`$${m.cash_on_hand_end.toLocaleString()}` });

  return badges;
}

function idxByCommitteeCycle(arr) {
  // For quick lookups by `${committee_id}_${cycle}`
  const m = new Map();
  for (const r of arr) {
    const k = `${r.committee_id}_${r.cycle}`;
    m.set(k, r);
  }
  return m;
}

// ---- build committees bundle ----------------------------------------------
const siteCommittees = {};
for (const m of metrics) {
  siteCommittees[m.committee_id] = {
    cycle: m.cycle,
    name: m.name || m.committee_name || null,
    totals: {
      total: safeNum(m.total, 0),
      individual: safeNum(m.total_individual, 0),
      small_individual: safeNum(m.total_small_individual, 0),
      committee: safeNum(m.total_committee, 0)
    },
    shares: {
      individual: round(safeNum(m.share_individual, 0), 4),
      small_individual: round(safeNum(m.share_small_individual, 0), 4),
      committee: round(safeNum(m.share_committee, 0), 4)
    },
    tags: m.tags || {},
    top_donors: (m.top_donors || []).map(d => ({ name: d.name, amount: round(safeNum(d.amount, 0), 2) })),
    cash_on_hand_end: safeNum(m.cash_on_hand_end, 0),
    totals_ytd: {
      receipts: safeNum(m.total_receipts_ytd, 0),
      disbursements: safeNum(m.total_disbursements_ytd, 0),
      burn_rate: Number.isFinite(m.burn_rate_ytd) ? round(m.burn_rate_ytd, 3) : m.burn_rate_ytd ?? null
    },
    badges: badgeEval(m),
    generated_at: today
  };
}
await fs.writeFile(path.join(SITE_DIR,"committees.json"), JSON.stringify(siteCommittees,null,2));

// ---- build candidates bundle ----------------------------------------------
const byKey = idxByCommitteeCycle(metrics);
const candOut = {};

for (const cycle of cycles) {
  for (const cid of (cfg.candidate_ids || [])) {
    try {
      const cmtes = await getCandidateCommittees(cid, cycle);
      const rows = cmtes
        .map(k => byKey.get(`${k}_${cycle}`))
        .filter(Boolean);

      if (!rows.length) continue;

      const sum = (fn)=> rows.reduce((a,b)=> a + safeNum(fn(b), 0), 0);

      const total = sum(x=>x.total);
      const indiv = sum(x=>x.total_individual);
      const small = sum(x=>x.total_small_individual);
      const cmte  = sum(x=>x.total_committee);
      const cash  = sum(x=>x.cash_on_hand_end);
      const recY  = sum(x=>x.total_receipts_ytd);
      const disY  = sum(x=>x.total_disbursements_ytd);
      const burn  = recY ? disY/recY : (disY>0?Infinity:0);

      // Merge tags
      const tags = {};
      for (const r of rows) for (const [k,v] of Object.entries(r.tags || {})) {
        tags[k] = safeNum(tags[k], 0) + safeNum(v, 0);
      }

      // Merge & rank donors
      const topMap = {};
      for (const r of rows) for (const d of (r.top_donors||[])) {
        topMap[d.name] = safeNum(topMap[d.name], 0) + safeNum(d.amount, 0);
      }
      const top = Object.entries(topMap)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,25)
        .map(([name,amount])=>({name, amount: round(amount, 2)}));

      const merged = {
        candidate_id: cid,
        cycle,
        committees: cmtes,
        totals: { total, individual: indiv, small_individual: small, committee: cmte },
        shares: {
          individual: total ? round(indiv/total, 4) : 0,
          small_individual: total ? round(small/total, 4) : 0,
          committee: total ? round(cmte/total, 4) : 0
        },
        tags: Object.fromEntries(Object.entries(tags).map(([k,v])=>[k, round(v, 2)])),
        top_donors: top,
        cash_on_hand_end: round(cash, 2),
        totals_ytd: {
          receipts: round(recY, 2),
          disbursements: round(disY, 2),
          burn_rate: Number.isFinite(burn) ? round(burn, 3) : burn
        },
        generated_at: today
      };

      // Evaluate badges using merged stats
      merged.badges = badgeEval({
        ...merged,
        share_individual: merged.shares.individual,
        share_small_individual: merged.shares.small_individual,
        share_committee: merged.shares.committee,
        burn_rate_ytd: merged.totals_ytd.burn_rate
      });

      candOut[cid] = merged;
    } catch (e) {
      console.warn("candidate aggregate error", cid, cycle, e?.message||e);
    }
  }
}

await fs.writeFile(path.join(SITE_DIR,"candidates.json"), JSON.stringify(candOut,null,2));

console.log("wrote", path.join(SITE_DIR,"committees.json"), "and", path.join(SITE_DIR,"candidates.json"));

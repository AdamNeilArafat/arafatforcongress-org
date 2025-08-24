import fs from "node:fs/promises";
import path from "node:path";
import { preflight, ensureDir, readJSON, ymd, getJSON } from "./lib.mjs";

await preflight();
const cfg = (await readJSON("config/fec-targets.json", {})) || {};
const cycles = Array.isArray(cfg.cycles) && cfg.cycles.length ? cfg.cycles : [2026];
const today = ymd(new Date(), cfg.timezone || "UTC");
const SITE_DIR = path.join("data", "site");
await ensureDir(SITE_DIR);

// Expect committee metrics from warehouse (your warehouse step should write this file)
const wh = await readJSON("data/warehouse/committee_metrics.json", {});
const metrics = Object.values(wh || {});

// candidate → committees (principal/authorized) for cycle
async function getCandidateCommittees(candidateId, cycle) {
  const u = new URL(`https://api.open.fec.gov/v1/candidate/${candidateId}/committees/`);
  u.searchParams.set("cycle", String(cycle));
  u.searchParams.set("per_page", "100");
  const j = await getJSON(u);
  return Array.from(new Set((j?.results || []).map(r => r.committee_id)));
}

function badgeEval(m) {
  const badges = [];
  if (m.share_small_individual >= 0.50) badges.push({ key: "small_dollar_powered", label: "Small‑Dollar Powered", reason: `Small individual share ${(m.share_small_individual*100).toFixed(1)}%` });
  if (m.share_committee >= 0.30) badges.push({ key: "corporate_pac_reliant", label: "Corporate PAC Reliant", reason: `Committee/PAC share ${(m.share_committee*100).toFixed(1)}%` });
  const t = (k)=> Number((m.tags?.[k]||0).toFixed(2));
  if (t("aipac") > 0)  badges.push({ key:"aipac_money",   label:"AIPAC‑linked Money",        reason:`$${t("aipac").toLocaleString()}` });
  if (t("defense") > 0)badges.push({ key:"defense_money", label:"Defense Contractor Money",  reason:`$${t("defense").toLocaleString()}` });
  if (t("fossil") > 0) badges.push({ key:"fossil_money",  label:"Fossil Fuel Money",         reason:`$${t("fossil").toLocaleString()}` });
  if (t("pharma") > 0) badges.push({ key:"pharma_money",  label:"Pharma Money",              reason:`$${t("pharma").toLocaleString()}` });
  if (t("tech") > 0)   badges.push({ key:"tech_money",    label:"Big Tech Money",            reason:`$${t("tech").toLocaleString()}` });
  if (Number.isFinite(m.burn_rate_ytd) && m.burn_rate_ytd > 1.0) badges.push({ key:"burn_rate_high", label:"High Burn Rate", reason:`${(m.burn_rate_ytd*100).toFixed(0)}% of receipts` });
  if ((m.cash_on_hand_end || 0) > 0 && m.cash_on_hand_end < 100000) badges.push({ key:"low_cash_on_hand", label:"Low Cash on Hand", reason:`$${m.cash_on_hand_end.toLocaleString()}` });
  return badges;
}

// per-committee bundles
const siteCommittees = {};
for (const m of metrics) {
  siteCommittees[m.committee_id] = {
    cycle: m.cycle,
    totals: {
      total: m.total,
      individual: m.total_individual,
      small_individual: m.total_small_individual,
      committee: m.total_committee
    },
    shares: {
      individual: m.share_individual,
      small_individual: m.share_small_individual,
      committee: m.share_committee
    },
    tags: m.tags || {},
    top_donors: m.top_donors || [],
    cash_on_hand_end: m.cash_on_hand_end || 0,
    totals_ytd: {
      receipts: m.total_receipts_ytd || 0,
      disbursements: m.total_disbursements_ytd || 0,
      burn_rate: m.burn_rate_ytd ?? null
    },
    badges: badgeEval(m)
  };
}
await fs.writeFile(path.join(SITE_DIR,"committees.json"), JSON.stringify(siteCommittees,null,2));

// per-candidate aggregates
const candOut = {};
for (const cycle of cycles) {
  for (const cid of (cfg.candidate_ids||[])) {
    try {
      const cmtes = await getCandidateCommittees(cid, cycle);
      const rows = cmtes.map(k => metrics.find(x => `${x.committee_id}_${x.cycle}` === `${k}_${cycle}`)).filter(Boolean);
      if (!rows.length) continue;
      const sum = (fn)=> rows.reduce((a,b)=> a + (fn(b)||0), 0);
      const total = sum(x=>x.total);
      const indiv = sum(x=>x.total_individual);
      const small = sum(x=>x.total_small_individual);
      const cmte  = sum(x=>x.total_committee);
      const cash  = sum(x=>x.cash_on_hand_end);
      const recY  = sum(x=>x.total_receipts_ytd);
      const disY  = sum(x=>x.total_disbursements_ytd);
      const burn  = recY ? disY/recY : (disY>0?Infinity:0);

      const tags = {};
      for (const r of rows) for (const [k,v] of Object.entries(r.tags || {})) tags[k] = (tags[k]||0)+v;

      const topMap = {};
      for (const r of rows) for (const d of (r.top_donors||[])) topMap[d.name]=(topMap[d.name]||0)+d.amount;
      const top = Object.entries(topMap).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([name,amount])=>({name, amount:Number(amount.toFixed(2))}));

      const merged = {
        candidate_id: cid,
        cycle,
        committees: cmtes,
        totals: { total, individual: indiv, small_individual: small, committee: cmte },
        shares: {
          individual: total?Number((indiv/total).toFixed(4)):0,
          small_individual: total?Number((small/total).toFixed(4)):0,
          committee: total?Number((cmte/total).toFixed(4)):0
        },
        tags: Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,Number(v.toFixed(2))])),
        top_donors: top,
        cash_on_hand_end: cash,
        totals_ytd: { receipts: recY, disbursements: disY, burn_rate: Number.isFinite(burn)?Number(burn.toFixed(3)):burn }
      };
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

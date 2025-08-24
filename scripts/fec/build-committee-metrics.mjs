import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ensureDir } from "./lib.mjs";

const RAW_ROOT = "data/raw";
const WH_DIR = "data/warehouse";

async function readNDJSON(file) {
  const rows = [];
  try {
    const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of rl) {
      const s = line.trim(); if (!s) continue;
      try { rows.push(JSON.parse(s)); } catch {}
    }
  } catch {}
  return rows;
}

async function latestRawDir() {
  const items = await fs.readdir(RAW_ROOT, { withFileTypes: true }).catch(() => []);
  const dirs = items.filter(d => d.isDirectory()).map(d => d.name).sort();
  return dirs.length ? path.join(RAW_ROOT, dirs[dirs.length - 1]) : null;
}

const safeNum = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const pick = (o, ...ks) => ks.find(k => o?.[k] != null) ? o[ks.find(k => o?.[k] != null)] : null;

function maxDate(a,b){ if(!a) return b; if(!b) return a; return a>b?a:b; }

(async () => {
  await ensureDir(WH_DIR);
  const dir = await latestRawDir();
  if (!dir) { console.error("No data/raw/YYYY-MM-DD folder found. Run ingest first."); process.exit(1); }

  const files = (await fs.readdir(dir)).filter(f => f.startsWith("committee_reports_") && f.endsWith(".ndjson"));
  const metricsById = new Map();

  for (const f of files) {
    const rows = await readNDJSON(path.join(dir, f));
    for (const r of rows) {
      const id = r.committee_id || r.committee || r.committeeid;
      if (!id) continue;

      const cur = metricsById.get(id) || {
        committee_id: id,
        name: r.committee_name || null,
        cycle: r.cycle || null,
        filings: 0,
        total_receipts_sum: 0,
        total_disbursements_sum: 0,
        latest_coverage_end_date: null,
        latest_cash_on_hand_end_period: null,
        last_report_type: null
      };

      cur.filings += 1;
      cur.total_receipts_sum += safeNum(pick(r,"total_receipts","receipts"));
      cur.total_disbursements_sum += safeNum(pick(r,"total_disbursements","disbursements"));

      const covEnd = pick(r,"coverage_end_date","coverage_end","report_year_end");
      const coh = pick(r,"cash_on_hand_end_period","cash_on_hand");
      if (maxDate(cur.latest_coverage_end_date,covEnd) !== cur.latest_coverage_end_date) {
        cur.latest_coverage_end_date = covEnd || null;
        cur.latest_cash_on_hand_end_period = Number.isFinite(Number(coh)) ? Number(coh) : null;
        cur.last_report_type = pick(r,"report_type","form_type") || null;
        cur.name = cur.name || r.committee_name || null;
        cur.cycle = cur.cycle || r.cycle || null;
      }

      metricsById.set(id, cur);
    }
  }

  const out = Array.from(metricsById.values()).sort((a,b)=> (b.total_receipts_sum||0)-(a.total_receipts_sum||0));
  await fs.writeFile(path.join(WH_DIR,"committee_metrics.json"), JSON.stringify(out,null,2));
  console.log("wrote", path.join(WH_DIR,"committee_metrics.json"));
})();

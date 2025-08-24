import { preflight, ensureDir, appendNDJSON, ymd, getJSON, collectPaged, readJSON, readCursors, writeCursors, sleep } from "./lib.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const cfg = (await readJSON("config/fec-targets.json", {})) || {};
await preflight();

const today = ymd();
const RAW_DIR = `data/raw/${today}`;
await ensureDir(RAW_DIR);

// Allow running without hard-coded IDs by skipping empty lists
const cycles = Array.isArray(cfg.cycles) && cfg.cycles.length ? cfg.cycles : [2026];
const candidateIds = Array.isArray(cfg.candidate_ids) ? cfg.candidate_ids.filter(Boolean) : [];
const committeeIds = Array.isArray(cfg.committee_ids) ? cfg.committee_ids.filter(Boolean) : [];

const cursors = await readCursors();

// ---- Helpers
async function saveResults(name, rows) {
  await appendNDJSON(path.join(RAW_DIR, `${name}.ndjson`), rows);
}

async function pullCandidateStuff() {
  const out = [];

  for (const cid of candidateIds) {
    // candidate details
    const details = await getJSON(`/candidate/${cid}`);
    if (details?.results?.length) out.push(...details.results);
    await sleep(200);

    // authorized committees link
    const comms = await getJSON(`/candidate/${cid}/committees`, { per_page: 100 });
    await saveResults(`candidate_${cid}_committees`, comms?.results ?? []);
    await sleep(200);
  }
  await saveResults("candidates", out);
}

async function pullCommitteeStuff() {
  const out = [];
  for (const cmte of committeeIds) {
    const details = await getJSON(`/committee/${cmte}`);
    if (details?.results?.length) out.push(...details.results);
    await sleep(200);

    // committee reports (for cash on hand, debts, totals)
    for (const cycle of cycles) {
      const reps = await getJSON(`/committee/${cmte}/reports/`, {
        two_year_transaction_period: cycle, per_page: 100
      });
      await saveResults(`committee_${cmte}_reports_${cycle}`, reps?.results ?? []);
      await sleep(200);
    }
  }
  await saveResults("committees", out);
}

// Aggregate receipts (by size/state/employer/zip) per committee + cycle
async function pullScheduleAAggregates() {
  for (const cmte of committeeIds) {
    for (const cycle of cycles) {
      const common = { two_year_transaction_period: cycle, committee_id: cmte, per_page: 100 };

      const bySize = await collectPaged("/schedules/schedule_a/by_size/", { ...common, is_individual: true }, 5);
      await saveResults(`sa_${cmte}_${cycle}_by_size`, bySize);

      const byState = await collectPaged("/schedules/schedule_a/by_state/", { ...common }, 30);
      await saveResults(`sa_${cmte}_${cycle}_by_state`, byState);

      const byEmployer = await collectPaged("/schedules/schedule_a/by_employer/", { ...common, is_individual: true }, 30);
      await saveResults(`sa_${cmte}_${cycle}_by_employer`, byEmployer);

      const byZip = await collectPaged("/schedules/schedule_a/by_zip/", { ...common }, 50);
      await saveResults(`sa_${cmte}_${cycle}_by_zip`, byZip);

      await sleep(250);
    }
  }
}

// Disbursements (Schedule B) – last 400 days window for simplicity (incremental possible)
async function pullScheduleB() {
  const since = cursors.sched_b_min_date || new Date(Date.now() - 400*864e5).toISOString().slice(0,10);
  for (const cmte of committeeIds) {
    let page = 1;
    while (page <= 50) {
      const data = await getJSON("/schedules/schedule_b/", {
        committee_id: cmte,
        min_date: since,
        sort: "disbursement_date",
        sort_hide_null: false,
        per_page: 100,
        page
      });
      const rows = data?.results ?? [];
      await saveResults(`sb_${cmte}`, rows);
      const pages = data?.pagination?.pages ?? 1;
      if (page >= pages) break;
      page++;
      await sleep(200);
    }
  }
  cursors.sched_b_min_date = today; // next run pulls only new window
}

// Independent Expenditures (Schedule E) by candidate (for/against totals + items)
async function pullScheduleE() {
  const since = cursors.sched_e_min_date || new Date(Date.now() - 400*864e5).toISOString().slice(0,10);
  for (const cid of candidateIds) {
    let page = 1;
    while (page <= 50) {
      const data = await getJSON("/schedules/schedule_e/", {
        candidate_id: cid,
        min_date: since,
        per_page: 100,
        sort: "expenditure_date",
        sort_hide_null: false,
        page
      });
      const rows = data?.results ?? [];
      await saveResults(`se_${cid}`, rows);
      const pages = data?.pagination?.pages ?? 1;
      if (page >= pages) break;
      page++;
      await sleep(200);
    }
  }
  cursors.sched_e_min_date = today;
}

await pullCandidateStuff().catch(e => console.error("candidate pull:", e));
await pullCommitteeStuff().catch(e => console.error("committee pull:", e));
await pullScheduleAAggregates().catch(e => console.error("sched A:", e));
await pullScheduleB().catch(e => console.error("sched B:", e));
await pullScheduleE().catch(e => console.error("sched E:", e));

await writeCursors(cursors);

console.log("Ingest complete →", RAW_DIR);

#!/usr/bin/env node
/**
 * Build config/candidates.csv for a given election cycle (default 2026).
 * Data source: OpenFEC API (candidates endpoints).
 *
 * Output columns:
 * candidate_id,name,office,state,district,party,incumbent_challenge,principal_committee_ids,is_active
 *
 * Notes:
 * - House = office "H", Senate = office "S". (We skip presidential here.)
 * - Many candidates have multiple principal committees; joined by comma.
 * - "incumbent_challenge" is an FEC code indicating status vs. incumbent.
 *
 * Docs: https://api.open.fec.gov/developers/  (Candidates, Committees)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");
const OUT = path.join(CONFIG_DIR, "candidates.csv");

const API_BASE = "https://api.open.fec.gov/v1";
const API_KEY = process.env.FEC_API_KEY || process.env.OPENFEC_API_KEY;
const CYCLE = Number(process.env.CYCLE || process.argv[2] || 2026); // e.g., 2026

if (!API_KEY) {
  console.error("Missing FEC_API_KEY in environment.");
  process.exit(1);
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

async function fetchJSON(url, params = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  u.searchParams.set("api_key", API_KEY);
  const res = await fetch(u.toString(), { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`FEC ${res.status} for ${u}\n${t}`);
  }
  return res.json();
}

/** Pull candidates for an office with pagination */
async function fetchCandidatesForOffice(office, cycle) {
  const all = [];
  let page = 1;
  const per_page = 100;
  // /candidates/ supports filtering by 'office', 'election_year', 'is_active_candidate'
  while (true) {
    const data = await fetchJSON(`${API_BASE}/candidates/`, {
      office,             // 'H' or 'S'
      election_year: cycle,
      is_active_candidate: true,
      page, per_page,
      sort: "name",
      sort_hide_null: false
    });
    const results = data?.results || [];
    all.push(...results);
    const pages = data?.pagination?.pages || 0;
    if (page >= pages || results.length === 0) break;
    page++;
  }
  return all;
}

/** For each candidate, pull committees (principal) */
async function fetchPrincipalCommittees(candidate_id, cycle) {
  // /candidate/{id}/committees/ lists all committees; we filter principals & cycle
  const data = await fetchJSON(`${API_BASE}/candidate/${candidate_id}/committees/`, {
    cycle,
    per_page: 100
  });
  const results = data?.results || [];
  return results
    .filter(r => r.designation_full?.toLowerCase().includes("principal"))
    .map(r => r.committee_id)
    .filter(Boolean);
}

async function main() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  console.log(`Pulling active candidates for ${CYCLE}…`);
  const [house, senate] = await Promise.all([
    fetchCandidatesForOffice("H", CYCLE),
    fetchCandidatesForOffice("S", CYCLE)
  ]);

  const combined = [...house, ...senate];

  // Enrich with principal committees (do it in small batches to be kind to the API)
  const outRows = [];
  for (const c of combined) {
    const committees = await fetchPrincipalCommittees(c.candidate_id, CYCLE).catch(() => []);
    outRows.push({
      candidate_id: c.candidate_id || "",
      name: c.name || "",
      office: c.office || "",
      state: c.state || "",
      district: c.office === "H" ? (c.district || "") : "",
      party: c.party || "",               // You can later normalize using FEC party codes
      incumbent_challenge: c.incumbent_challenge || "", // e.g., "C" challenger, "I" incumbent
      principal_committee_ids: committees.join(","),
      is_active: c.is_active_candidate === true ? "true" : "false"
    });
    // Gentle throttle to avoid rate limiting
    await new Promise(r => setTimeout(r, 120));
  }

  // Sort for sanity (House by state/district, then Senate)
  const houseRows = outRows.filter(r => r.office === "H")
    .sort((a,b) => a.state === b.state
      ? Number(a.district||0) - Number(b.district||0)
      : a.state.localeCompare(b.state));
  const senateRows = outRows.filter(r => r.office === "S")
    .sort((a,b) => a.state.localeCompare(b.state));

  const all = [...houseRows, ...senateRows];

  // Write CSV
  const header = "candidate_id,name,office,state,district,party,incumbent_challenge,principal_committee_ids,is_active";
  const lines = [header].concat(all.map(r => [
    csvEscape(r.candidate_id),
    csvEscape(r.name),
    csvEscape(r.office),
    csvEscape(r.state),
    csvEscape(r.district),
    csvEscape(r.party),
    csvEscape(r.incumbent_challenge),
    csvEscape(r.principal_committee_ids),
    csvEscape(r.is_active)
  ].join(",")));

  fs.writeFileSync(OUT, lines.join("\n"), "utf8");
  console.log(`Wrote ${all.length} candidates → ${path.relative(process.cwd(), OUT)}`);
}

main().catch(err => { console.error(err); process.exit(1); });

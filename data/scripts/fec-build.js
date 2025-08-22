#!/usr/bin/env node
/**
 * FEC pipeline builder.
 *
 * Outputs JSON files in /data the site can read:
 * - data/members.json
 * - data/donors-by-member.json
 *
 * Behavior:
 * - If FEC_API_KEY is set AND config/members.csv has FEC IDs, fetch live data.
 * - Otherwise falls back to demo data in data/demo/*.demo.json so the site still renders.
 *
 * CSV format (config/members.csv):
 * bioguide_id,name,state,district,party,fec_ids
 * AAAAAA,First Last,WA,10,D,H6WA08134
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import Papa from "papaparse";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DEMO_DIR = path.join(DATA_DIR, "demo");
const CONFIG_DIR = path.join(ROOT, "config");
const MEMBERS_CSV = path.join(CONFIG_DIR, "members.csv");

const FEC_API_KEY = process.env.FEC_API_KEY || process.env.fec_api_key || "";

const ensureDirs = () => {
  for (const dir of [DATA_DIR, DEMO_DIR, CONFIG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readCSV = (filePath) =>
  new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const content = fs.readFileSync(filePath, "utf8");
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
    });
  });

const writeJSON = (filePath, obj) => {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  console.log("Wrote", path.relative(ROOT, filePath));
};

const copyIfMissing = (src, dest) => {
  if (!fs.existsSync(dest) && fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("Seeded", path.relative(ROOT, dest));
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fecGet(url, params = {}) {
  // Append API key + pagination defaults
  const u = new URL(url);
  u.searchParams.set("api_key", FEC_API_KEY);
  if (!u.searchParams.has("per_page")) u.searchParams.set("per_page", "100");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  const res = await fetch(u.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FEC ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Fetch candidate totals for a given FEC candidate ID (cycle optional).
 * Uses /candidate/{id}/totals/ endpoint.
 */
async function fetchCandidateTotals(candidateId, cycle = undefined) {
  // Docs: https://api.open.fec.gov/developers/ (Totals endpoint family)
  // We’ll pull the latest cycle if none given (FEC returns multiple cycles).
  const url = `https://api.open.fec.gov/v1/candidate/${candidateId}/totals/`;
  const json = await fecGet(url, cycle ? { cycle } : {});
  const results = json.results || [];
  // Choose most recent cycle
  results.sort((a, b) => (b.cycle || 0) - (a.cycle || 0));
  return results[0] || null;
}

/**
 * Build donors-by-member data:
 * For each member row, roll up: total_receipts, individual_contributions, pac_contributions, cash_on_hand, etc.
 */
async function buildDonorsByMember(members) {
  const out = [];
  for (const m of members) {
    const fecIds = (m.fec_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let best = null;
    for (const id of fecIds) {
      try {
        const totals = await fetchCandidateTotals(id);
        if (totals) {
          // Prefer the totals with highest receipts if multiple IDs present
          if (!best || (totals.total_receipts || 0) > (best.total_receipts || 0)) {
            best = { candidate_id: id, ...totals };
          }
        }
        // be gentle with API
        await sleep(120);
      } catch (e) {
        console.warn(`Warn: ${m.name} (${id}) → ${e.message}`);
      }
    }

    out.push({
      bioguide_id: m.bioguide_id || null,
      name: m.name,
      state: m.state,
      district: m.district,
      party: m.party,
      fec_ids: fecIds,
      // If we found live totals, map a few headline fields the site can use
      totals: best
        ? {
          cycle: best.cycle,
          total_receipts: best.total_receipts,
          individual_contributions: best.individual_contributions,
          pac_contributions: best.pac_contributions,
          contributions_from_individuals: best.individual_contributions, // alias
          contributions_from_pacs: best.pac_contributions, // alias
          disbursements: best.disbursements,
          cash_on_hand_end_period: best.cash_on_hand_end_period,
          debts_owed_by_committee: best.debts_owed_by_committee
        }
        : null
    });
  }
  return out;
}

/**
 * If no API key or no members CSV, seed demo data and exit.
 */
async function buildWithFallback() {
  console.log("No FEC key or members.csv missing — using demo data fallback.");
  // Seed demo files if absent
  copyIfMissing(
    path.join(DEMO_DIR, "members.demo.json"),
    path.join(DATA_DIR, "members.json")
  );
  copyIfMissing(
    path.join(DEMO_DIR, "donors-by-member.demo.json"),
    path.join(DATA_DIR, "donors-by-member.json")
  );
}

/**
 * Main
 */
(async function main() {
  ensureDirs();

  // Create a template CSV if missing
  if (!fs.existsSync(MEMBERS_CSV)) {
    const tmpl = `bioguide_id,name,state,district,party,fec_ids
AAAAAAA,Your Name,WA,10,D,H6WA08134
BBBBBBB,Opponent Name,WA,10,D,H0WA00000
`;
    fs.writeFileSync(MEMBERS_CSV, tmpl, "utf8");
    console.log("Created template:", path.relative(ROOT, MEMBERS_CSV));
  }

  // Create demo seeds if missing
  if (!fs.existsSync(path.join(DEMO_DIR, "members.demo.json"))) {
    const demoMembers = [
      {
        bioguide_id: "AAAAAAA",
        name: "Your Name",
        state: "WA",
        district: "10",
        party: "D",
        fec_ids: ["H6WA08134"]
      },
      {
        bioguide_id: "BBBBBBB",
        name: "Opponent Name",
        state: "WA",
        district: "10",
        party: "D",
        fec_ids: ["H0WA00000"]
      }
    ];
    writeJSON(path.join(DEMO_DIR, "members.demo.json"), demoMembers);
  }

  if (!fs.existsSync(path.join(DEMO_DIR, "donors-by-member.demo.json"))) {
    const demoDonors = [
      {
        bioguide_id: "AAAAAAA",
        name: "Your Name",
        state: "WA",
        district: "10",
        party: "D",
        fec_ids: ["H6WA08134"],
        totals: {
          cycle: 2026,
          total_receipts: 250000,
          individual_contributions: 240000,
          pac_contributions: 0,
          disbursements: 180000,
          cash_on_hand_end_period: 70000,
          debts_owed_by_committee: 0
        }
      },
      {
        bioguide_id: "BBBBBBB",
        name: "Opponent Name",
        state: "WA",
        district: "10",
        party: "D",
        fec_ids: ["H0WA00000"],
        totals: {
          cycle: 2026,
          total_receipts: 2100000,
          individual_contributions: 900000,
          pac_contributions: 1150000,
          disbursements: 1900000,
          cash_on_hand_end_period: 200000,
          debts_owed_by_committee: 0
        }
      }
    ];
    writeJSON(path.join(DEMO_DIR, "donors-by-member.demo.json"), demoDonors);
  }

  const members = await readCSV(MEMBERS_CSV);

  const liveMode = Boolean(FEC_API_KEY && members.length);
  if (!liveMode) {
    await buildWithFallback();
    return;
  }

  console.log(`Building with FEC live data for ${members.length} member(s)…`);

  // 1) Persist members.json from the CSV (site expects this file)
  const normalizedMembers = members.map((m) => ({
    bioguide_id: m.bioguide_id || null,
    name: m.name,
    state: m.state,
    district: m.district,
    party: m.party,
    fec_ids: (m.fec_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }));
  writeJSON(path.join(DATA_DIR, "members.json"), normalizedMembers);

  // 2) donors-by-member.json via FEC totals
  const donors = await buildDonorsByMember(normalizedMembers);
  writeJSON(path.join(DATA_DIR, "donors-by-member.json"), donors);

  console.log("Done.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

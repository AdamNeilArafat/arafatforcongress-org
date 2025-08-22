// scripts/build-members-json.mjs
// Build /accountability/data/members.json from UnitedStates "legislators-current.yaml"
// Keys = bioguide_id (e.g., "A000374"), values shaped for your page.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import fetch from "node-fetch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "accountability", "data", "members.json");

// UnitedStates datasets (authoritative, actively maintained)
const YAML_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/refs/heads/master/legislators-current.yaml";

function fullName(n = {}) {
  // prefer the official name if present; fall back to first/last
  return n.official_full || [n.first, n.middle, n.last, n.suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function latestTerm(terms = []) {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  // Terms are chronological; latest is last
  return terms[terms.length - 1];
}

function buildSeat(t) {
  if (!t) return "—";
  if (t.type === "sen") return t.state; // Senate seat shows state
  // House: state + district (at-large sometimes 0)
  const dist = t.district === 0 || t.district === "0" ? "AL" : String(t.district ?? "").padStart(2, "0");
  return `${t.state}-${dist}`;
}

function chamberOf(t) {
  if (!t) return "";
  return t.type === "sen" ? "senate" : "house";
}

function partyOf(t) {
  if (!t) return "";
  return t.party || "";
}

function photoUrl(bioguide) {
  // Public domain headshots served at predictable URLs by Bioguide ID
  // 225x275 is your preferred size for table & modal; srcset can use 100x125 in the UI
  return `https://theunitedstates.io/images/congress/225x275/${bioguide}.jpg`;
}

async function main() {
  const resp = await fetch(YAML_URL, { headers: { "User-Agent": "arafatforcongress-bot" } });
  if (!resp.ok) throw new Error(`Failed to fetch legislators-current.yaml: ${resp.status}`);
  const text = await resp.text();
  const data = yaml.load(text); // array of legislators

  const out = {};
  for (const item of data) {
    const ids = item?.id || {};
    const bio = ids.bioguide;
    if (!bio) continue;

    const t = latestTerm(item.terms);
    const seat = buildSeat(t);
    const chamber = chamberOf(t);
    const party = partyOf(t);
    const state = t?.state || "";
    const district = t?.type === "rep" ? (t.district ?? null) : null;

    const name = fullName(item.name || {});
    out[bio] = {
      id: bio,                 // Keep "id" for your existing code paths
      bioguide_id: bio,        // Explicit for clarity
      name,
      seat,                    // e.g., "WA-10" or "CA" for senators
      state,
      chamber,                 // "house" | "senate"
      party,                   // "D" | "R" | "I" | etc.
      district,                // number or null (for senate)
      photo: photoUrl(bio)
    };
  }

  // Ensure directory exists
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(out).length} members to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

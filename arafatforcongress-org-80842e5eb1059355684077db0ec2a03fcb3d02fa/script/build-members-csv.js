#!/usr/bin/env node
/**
 * Build a complete config/members.csv (House + Senate, ~535 seats)
 * using the maintained "congress-legislators" dataset.
 *
 * Source: https://github.com/unitedstates/congress-legislators
 * File: legislators-current.yaml (contains BioGuide + FEC IDs)
 *
 * Output CSV columns:
 * bioguide_id,name,state,district,party,fec_ids
 *
 * Notes:
 * - Senators have no district; we leave it blank ("").
 * - Party normalized to D / R / I (others fall through as-is).
 * - Some entries may have multiple FEC IDs; we join by comma.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");
const OUT_CSV = path.join(CONFIG_DIR, "members.csv");

// Raw file on GitHub (master branch)
const SOURCE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/master/legislators-current.yaml";

// Normalize party to short code when obvious
function normalizeParty(p) {
  if (!p) return "";
  const s = String(p).toLowerCase();
  if (s.startsWith("dem")) return "D";
  if (s.startsWith("rep")) return "R";
  if (s.startsWith("ind")) return "I";
  return p; // leave as-is for caucus/other edge cases
}

// Prefer official_full if present
function formatName(nameObj = {}) {
  if (nameObj.official_full) return nameObj.official_full;
  const parts = [nameObj.first, nameObj.middle, nameObj.last, nameObj.suffix]
    .filter(Boolean)
    .join(" ");
  return parts || "Unknown";
}

// CSV escape (very light)
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  console.log("Fetching current legislators YAML…");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Failed to fetch legislators-current.yaml: ${res.status}\n${t}`);
  }
  const yamlText = await res.text();
  const data = YAML.parse(yamlText);

  if (!Array.isArray(data)) {
    throw new Error("Unexpected YAML format (expected top-level array).");
  }

  // Map to flat rows for current seat-holders (latest term)
  const rows = data.map((leg) => {
    const ids = leg.ids || {};
    const terms = Array.isArray(leg.terms) ? leg.terms : [];
    const latest = terms[terms.length - 1] || {};
    const type = latest.type; // 'rep' or 'sen'

    const bioguide = ids.bioguide || "";
    const fec = Array.isArray(ids.fec) ? ids.fec : ids.fec ? [ids.fec] : [];

    const name = formatName(leg.name);
    const state = latest.state || "";
    const district = type === "rep" ? (latest.district ?? "") : ""; // blank for senators
    const party = normalizeParty(latest.party);

    return {
      bioguide_id: bioguide,
      name,
      state,
      district,
      party,
      fec_ids: fec.join(",")
    };
  });

  // Filter: keep only current members with a House or Senate term
  const currentMembers = rows.filter((r) => r.state);

  // Sort for sanity: House (by state+district), then Senate (by state)
  const house = currentMembers.filter((r) => r.district !== "");
  const senate = currentMembers.filter((r) => r.district === "");

  house.sort((a, b) =>
    a.state === b.state ? Number(a.district || 0) - Number(b.district || 0) : a.state.localeCompare(b.state)
  );
  senate.sort((a, b) => a.state.localeCompare(b.state));

  const all = [...house, ...senate];

  // Write CSV header + rows
  const header = "bioguide_id,name,state,district,party,fec_ids";
  const lines = [header].concat(
    all.map((r) =>
      [
        csvEscape(r.bioguide_id),
        csvEscape(r.name),
        csvEscape(r.state),
        csvEscape(r.district),
        csvEscape(r.party),
        csvEscape(r.fec_ids)
      ].join(",")
    )
  );

  fs.writeFileSync(OUT_CSV, lines.join("\n"), "utf8");
  console.log(`Wrote ${all.length} rows → ${path.relative(process.cwd(), OUT_CSV)}`);

  // Quick vacancy / missing FEC heads-up
  const missingFEC = all.filter((r) => !r.fec_ids);
  if (missingFEC.length) {
    console.warn(`Note: ${missingFEC.length} member(s) missing FEC IDs (new appointee/vacancy edge cases). You can fill those later if needed.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

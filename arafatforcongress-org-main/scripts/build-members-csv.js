#!/usr/bin/env node
/**
 * Build config/members.csv (House + Senate).
 * Source: https://github.com/unitedstates/congress-legislators (legislators-current.yaml)
 * Output columns: bioguide_id,name,state,district,party,fec_ids
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");
const OUT_CSV = path.join(CONFIG_DIR, "members.csv");

const SOURCE_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/master/legislators-current.yaml";

function normalizeParty(p) {
  if (!p) return "";
  const s = String(p).toLowerCase();
  if (s.startsWith("dem")) return "D";
  if (s.startsWith("rep")) return "R";
  if (s.startsWith("ind")) return "I";
  return p;
}

function formatName(nameObj = {}) {
  if (nameObj.official_full) return nameObj.official_full;
  const parts = [nameObj.first, nameObj.middle, nameObj.last, nameObj.suffix].filter(Boolean).join(" ");
  return parts || "Unknown";
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fetch failed ${res.status} for ${url}\n${body}`);
  }
  return res.text();
}

async function main() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  console.log("Fetching current legislators YAML…");
  const yamlText = await fetchText(SOURCE_URL);
  const data = YAML.parse(yamlText);

  if (!Array.isArray(data)) throw new Error("Unexpected YAML format (expected array).");

  const rows = data.map((leg) => {
    const ids = leg.id || {};
    const terms = Array.isArray(leg.terms) ? leg.terms : [];
    const latest = terms[terms.length - 1] || {};
    const type = latest.type; // 'rep' or 'sen'

    const bioguide = ids.bioguide || "";
    const fec = Array.isArray(ids.fec) ? ids.fec : ids.fec ? [ids.fec] : [];

    const name = formatName(leg.name);
    const state = latest.state || "";
    const district = type === "rep" ? (latest.district ?? "") : ""; // blank for senators
    const party = normalizeParty(latest.party);

    return { bioguide_id: bioguide, name, state, district, party, fec_ids: fec.join(",") };
  });

  // keep only entries with a state (i.e., active latest term)
  const currentMembers = rows.filter((r) => r.state);

  const house = currentMembers.filter((r) => r.district !== "");
  const senate = currentMembers.filter((r) => r.district === "");

  house.sort((a, b) =>
    a.state === b.state
      ? Number(a.district || 0) - Number(b.district || 0)
      : a.state.localeCompare(b.state)
  );
  senate.sort((a, b) => a.state.localeCompare(b.state));

  const all = [...house, ...senate];

  const header = "bioguide_id,name,state,district,party,fec_ids";
  const lines = [header].concat(
    all.map((r) =>
      [r.bioguide_id, r.name, r.state, r.district, r.party, r.fec_ids].map(csvEscape).join(",")
    )
  );

  fs.writeFileSync(OUT_CSV, lines.join("\n"), "utf8");
  console.log(`Wrote ${all.length} rows → ${path.relative(process.cwd(), OUT_CSV)}`);

  // quick debug to stdout
  console.log("House:", house.length, "Senate:", senate.length, "Total:", all.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

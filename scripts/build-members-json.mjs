// scripts/build-members-json.mjs
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";

// ---- manual seed still included ----
const seed = [
  {
    id: "AARAFAT",
    name: "Adam Neil Arafat",
    state: "WA",
    seat: "WA-10",
    chamber: "house",
    party: "D",
    bioguide: "A000000",
    fec_ids: ["H4WA00123"] // TODO: your real FEC ID
  },
  {
    id: "S001135",
    name: "Marilyn Strickland",
    state: "WA",
    seat: "WA-10",
    chamber: "house",
    party: "D",
    bioguide: "S001135",
    fec_ids: ["H0WA10078"]
  }
];

const tidy = (s) => (s == null ? "" : String(s).trim());
const isHouse = (row) => tidy(row.district) && tidy(row.district) !== "0";
const toSeat = (state, district) => (isHouse({ district }) ? `${state}-${district}` : state);
const parseFecIds = (s) => tidy(s).split(",").map((x) => tidy(x)).filter(Boolean);

function csvToMembersObject(csvText) {
  const rows = parseCsv(csvText, { columns: true, skip_empty_lines: true });
  const out = {};
  for (const r of rows) {
    const rawId = tidy(r.bioguide_id) || tidy(r.bioguide) || tidy(r.ioguide_id) || tidy(r.id);
    if (!rawId) continue;
    const state = tidy(r.state).toUpperCase();
    const district = tidy(r.district);
    const party = tidy(r.party).toUpperCase();
    const seat = toSeat(state, district);
    const chamber = isHouse(r) ? "house" : "senate";

    out[rawId] = {
      id: rawId,
      bioguide: rawId,
      name: tidy(r.name),
      state,
      seat,
      chamber,
      party,
      fec_ids: parseFecIds(r.fec_ids)
    };
  }
  return out;
}

async function main() {
  await fs.mkdir("data", { recursive: true });

  // 1) Read CSV if present (we’ll keep the last downloaded file in repo)
  let csvMembers = {};
  const csvPath = path.join("config", "member.csv");
  if (existsSync(csvPath)) {
    const text = readFileSync(csvPath, "utf8");
    csvMembers = csvToMembersObject(text);
  }

  // 2) Seed wins on conflict
  const seedMembers = {};
  for (const m of seed) {
    const id = tidy(m.id) || tidy(m.bioguide);
    if (!id) continue;
    seedMembers[id] = {
      id,
      bioguide: m.bioguide || id,
      name: tidy(m.name),
      state: tidy(m.state).toUpperCase(),
      seat: tidy(m.seat),
      chamber: tidy(m.chamber).toLowerCase() || "house",
      party: tidy(m.party).toUpperCase(),
      fec_ids: Array.isArray(m.fec_ids) ? m.fec_ids : parseFecIds(m.fec_ids)
    };
  }

  const merged = { ...csvMembers, ...seedMembers };
  await fs.writeFile("data/members.json", JSON.stringify(merged, null, 2));
  console.log(`wrote data/members.json (${Object.keys(merged).length} members)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

import fs from "node:fs/promises";
import path from "node:path";
import {
  preflight,
  getJSON,
  readJSON,
  ymd,
} from "./lib.mjs";

// --- tiny CLI args parser ---
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (!a.startsWith("--")) return [];
    const eq = a.indexOf("=");
    if (eq > -1) return [[a.slice(2, eq), a.slice(eq + 1)]];
    return [[a.slice(2), true]];
  })
);

/*
Usage examples:
  node scripts/fec/resolve-ids.mjs --state=WA --district=10 --cycle=2026
  node scripts/fec/resolve-ids.mjs --state=WA --district=10 --cycle=2026 --write
  node scripts/fec/resolve-ids.mjs --name="Adam Arafat" --cycle=2026
Params:
  --state=WA           two-letter state
  --district=10        numeric district (no leading zeros needed)
  --cycle=2026         two-year cycle (required)
  --name="query"       optional name search (instead of state/district)
  --write              if present, updates config/fec-targets.json with found IDs
*/

async function main() {
  await preflight();

  const cycle = Number(args.cycle);
  if (!cycle) {
    console.error("ERROR: --cycle is required (e.g., --cycle=2026)");
    process.exit(2);
  }

  const state = args.state?.toUpperCase();
  const district = args.district ? String(parseInt(args.district, 10)).padStart(2, "0") : undefined;
  const nameQ = args.name;

  // Build candidate search URL
  const u = new URL("https://api.open.fec.gov/v1/candidates/search/");
  u.searchParams.set("office", "H");
  u.searchParams.set("cycle", String(cycle));
  u.searchParams.set("per_page", "50");
  u.searchParams.set("api_key", process.env.FEC_API_KEY);
  // prefer active candidates when filtering by geography
  if (state) u.searchParams.set("state", state);
  if (district) u.searchParams.set("district", district);
  if (nameQ) u.searchParams.set("q", nameQ);
  if (!nameQ) u.searchParams.set("is_active_candidate", "true");

  const candSearch = await getJSON(u);
  const candidates = Array.isArray(candSearch?.results) ? candSearch.results : [];

  if (!candidates.length) {
    console.log("No candidates found for filters:", { state, district, name: nameQ, cycle });
    process.exit(0);
  }

  // For each candidate, pull committees for the given cycle
  const rows = [];
  for (const c of candidates) {
    const cid = c.candidate_id;
    const name = c.name;
    const party = c.party_full || c.party || null;
    const incumbent = c.incumbent_challenge_full || c.incumbent_challenge || null;

    const commU = new URL(`https://api.open.fec.gov/v1/candidate/${cid}/committees/`);
    commU.searchParams.set("cycle", String(cycle));
    commU.searchParams.set("per_page", "100");
    commU.searchParams.set("api_key", process.env.FEC_API_KEY);
    const commJ = await getJSON(commU);
    const committees = Array.isArray(commJ?.results) ? commJ.results : [];

    const principal = committees.filter(
      (cm) => cm.designation === "P" || /principal/i.test(cm.designation_full || "")
    );
    const authorized = committees.filter(
      (cm) => cm.designation === "A" || /authorized/i.test(cm.designation_full || "")
    );

    rows.push({
      candidate_id: cid,
      candidate_name: name,
      party,
      incumbent,
      committees: committees.map((cm) => ({
        committee_id: cm.committee_id,
        name: cm.name,
        designation: cm.designation,           // P, A, etc.
        designation_full: cm.designation_full, // e.g., Principal campaign committee
        type_full: cm.committee_type_full,
      })),
      principal_ids: principal.map((cm) => cm.committee_id),
      authorized_ids: authorized.map((cm) => cm.committee_id),
    });
  }

  // Print a compact summary
  for (const r of rows) {
    console.log("—".repeat(60));
    console.log(`${r.candidate_name}  [${r.candidate_id}]  party=${r.party ?? "-"}  ${r.incumbent ?? ""}`);
    if (r.principal_ids.length) {
      console.log("  Principal:", r.principal_ids.join(", "));
    }
    if (r.authorized_ids.length) {
      console.log("  Authorized:", r.authorized_ids.join(", "));
    }
    if (!r.principal_ids.length && !r.authorized_ids.length) {
      console.log("  (no principal/authorized committees found for this cycle)");
    }
  }
  console.log("—".repeat(60));

  if (args.write) {
    // Merge found IDs into config/fec-targets.json
    const cfgPath = "config/fec-targets.json";
    let cfg = (await readJSON(cfgPath, {})) || {};
    cfg.cycles = Array.from(new Set([...(cfg.cycles || []), cycle]));
    const addCands = rows.map((r) => r.candidate_id);
    const addCmtes = rows.flatMap((r) => [...r.principal_ids, ...r.authorized_ids]);

    cfg.candidate_ids = Array.from(new Set([...(cfg.candidate_ids || []), ...addCands])).filter(Boolean);
    cfg.committee_ids = Array.from(new Set([...(cfg.committee_ids || []), ...addCmtes])).filter(Boolean);
    cfg.timezone = cfg.timezone || "America/Los_Angeles";

    await fs.mkdir(path.dirname(cfgPath), { recursive: true });
    await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    console.log("Updated", cfgPath, "→", cfg);
  }
}

main().catch((e) => {
  console.error("resolve-ids error:", e?.message || e);
  process.exit(1);
});

// scripts/build-members-json.mjs (replace the seed)
import fs from 'node:fs/promises';

const seed = [
  {
    id: "AARAFAT",
    name: "Adam Neil Arafat",
    state: "WA",
    seat: "WA-10",
    chamber: "house",
    party: "D",
    bioguide: "A000000",
    fec_ids: ["H4WA00123"] // <- your actual FEC ID when you have it
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

async function main() {
  await fs.mkdir('data', { recursive: true });
  const out = {};
  for (const m of seed) out[m.id] = m;
  await fs.writeFile('data/members.json', JSON.stringify(out, null, 2));
  console.log('wrote data/members.json');
}
main().catch(e => { console.error(e); process.exit(1); });

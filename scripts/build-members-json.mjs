// scripts/build-members-json.mjs
import fs from 'node:fs/promises';

// TODO: if you already have a members CSV/JSON, read/normalize that here instead.
const seed = [
  // Minimal shape. Add fields as you have them (bioguide, fec_ids, website, etc.)
  // { id:"D000001", name:"Allison Rivera", state:"WA", seat:"WA-10", chamber:"house", party:"D", bioguide:"D000001", fec_ids:["H0WA00123"] },
];

async function main() {
  await fs.mkdir('data', { recursive: true });
  const out = {};
  for (const m of seed) out[m.id] = m;
  await fs.writeFile('data/members.json', JSON.stringify(out, null, 2));
  console.log('wrote data/members.json');
}
main().catch(e => { console.error(e); process.exit(1); });

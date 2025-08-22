// --- fetch shim (Node 18+ has global fetch) ---
const fetch = globalThis.fetch ?? ((...args) =>
  import('node-fetch').then(({ default: f }) => f(...args))
);
// ----------------------------------------------
// scripts/annotate-awards.mjs
import fs from 'node:fs/promises';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI; // support either
if (!OPENAI_API_KEY) { console.log('No OPENAI key; skipping awards.'); process.exit(0); }

const donors = JSON.parse(await fs.readFile('data/donors-by-member.json', 'utf8'));
const members = JSON.parse(await fs.readFile('data/members.json', 'utf8'));

function badgeHeuristics(mId) {
  // fast, deterministic badges (no LLM needed) — tune thresholds here.
  const d = donors[mId] || {};
  const badges = [];
  if ((d.pac_pct || 0) >= 0.40) badges.push({ key: 'high-pac', label: 'High PAC Reliance' });
  const inds = d.industries || {};
  const total = Object.values(inds).reduce((s, v) => s + v, 0) || 1;
  const [top, amt] = Object.entries(inds).sort((a,b)=>b[1]-a[1])[0] || ['—', 0];
  if (amt / total >= 0.35) badges.push({ key: 'dominant-industry', label: 'Dominant Industry' });
  if ((d.out_state_dollars || 0) > (d.in_state_dollars || 0) * 1.05) badges.push({ key: 'out-of-state-heavy', label: 'Out-of-State Heavy' });
  return badges;
}

async function main() {
  // Optional: call OpenAI for narrative/validation (kept minimal to avoid cost)
  // We’ll still output deterministic badges even if the API is skipped/limited.
  const out = {};
  for (const mId of Object.keys(members)) {
    const base = badgeHeuristics(mId);
    out[mId] = { badges: base };
  }
  await fs.writeFile('data/member-awards.json', JSON.stringify(out, null, 2));
  console.log('wrote member-awards.json');
}
main().catch(e => { console.error(e); process.exit(1); });

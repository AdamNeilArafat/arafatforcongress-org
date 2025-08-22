// scripts/build-financials.mjs
import fs from "node:fs/promises";

// --- config ---
const API = "https://api.open.fec.gov/v1";
const CYCLE = 2024;
const FEC_KEY = process.env.FEC_API_KEY;

// Basic key sanity check (don’t hardcode your real key here)
function redact(k) { return k ? `${k.slice(0,4)}…${k.slice(-4)}` : "(none)"; }
if (!FEC_KEY || FEC_KEY.length < 20) {
  throw new Error(`Missing/placeholder FEC_API_KEY. Saw: ${redact(FEC_KEY)}`);
}

// tiny polite delay to avoid hammering api.data.gov (1,000/hr limit)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Single getJSON that accepts either string or URL
async function getJSON(input) {
  const u = input instanceof URL ? input : new URL(input);
  u.searchParams.set("api_key", FEC_KEY);
  const res = await fetch(u, { headers: { "Accept": "application/json" } });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`FEC ${res.status} → ${u.toString()}\n${txt.slice(0,400)}`);
    throw new Error(`${res.status} ${u.pathname}`);
  }
  return JSON.parse(txt);
}

// Load members produced by your members builder
async function loadMembers() {
  const raw = await fs.readFile("data/members.json", "utf8");
  return { members: JSON.parse(raw) };
}

// 1) Candidate → committees (history for a cycle). Supports page/per_page.
async function committeesForCandidate(candidateId, cycle = CYCLE) {
  let page = 1, out = [];
  while (true) {
    const u = new URL(`${API}/candidate/${candidateId}/committees/history/${cycle}/`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", "50");
    const js = await getJSON(u);
    out = out.concat(js.results || []);
    const pages = js?.pagination?.pages ?? page;
    if (page >= pages) break;
    page++;
    await sleep(120);
  }
  return out;
}

// 2) Schedule A itemized receipts: keyset pagination (NOT page/per_page).
//    We sort by -contribution_receipt_date and walk via last_indexes.
async function committeeReceipts(committeeId, cycle = CYCLE, maxPages = 20) {
  const results = [];
  let params = new URLSearchParams({
    committee_id: committeeId,
    two_year_transaction_period: String(cycle),
    sort: "-contribution_receipt_date",
    per_page: "100"
  });

  for (let i = 0; i < maxPages; i++) {
    const u = new URL(`${API}/schedules/schedule_a/`);
    // carry keyset cursor
    for (const [k,v] of params) u.searchParams.set(k, v);

    const js = await getJSON(u);
    results.push(...(js.results || []));

    const li = js?.pagination?.last_indexes;
    if (!li || !li.last_index) break; // no more pages

    params.set("last_index", String(li.last_index));
    // if the API returns other keyset fields, pass them along:
    if (li.last_contribution_receipt_date) {
      params.set("last_contribution_receipt_date", String(li.last_contribution_receipt_date));
    }
    await sleep(120);
  }
  return results;
}

// simple industry tagging heuristic (yours)
function topIndustryFromMemo(memo) {
  const s = (memo || "").toLowerCase();
  if (s.includes("pharma") || s.includes("biotech")) return "pharma";
  if (s.includes("oil") || s.includes("gas") || s.includes("energy")) return "oil";
  if (s.includes("defense") || s.includes("aerospace")) return "defense";
  if (s.includes("bank") || s.includes("finance") || s.includes("hedge")) return "finance";
  if (s.includes("tech") || s.includes("software") || s.includes("internet")) return "tech";
  if (s.includes("aipac") || s.includes("israel")) return "aipac";
  return null;
}

function moneyBucketsFromScheduleA(rows, memberState) {
  let pacAmt = 0, smallAmt = 0, inStateAmt = 0, outStateAmt = 0;
  const industryBucket = {};

  for (const r of rows) {
    const amt = r.contribution_receipt_amount || 0;

    // PAC vs small:
    // - Individuals are flagged by is_individual = true (Schedule A doc)
    // - PAC/committee money has contributor_committee_id or a committee-type contributor_type
    //   (fields described in Schedule A docs)
    const isPAC = !!r.contributor_committee_id ||
                  String(r.contributor_type || "").toLowerCase().includes("committee") ||
                  String(r.contributor_type || "").toLowerCase().includes("pac");
    const isIndividual = r.is_individual === true;

    if (isPAC) pacAmt += amt;
    else if (isIndividual) smallAmt += amt;
    else {
      // could be transfers/other orgs; ignore for the “small vs PAC” split
    }

    // geo (in-state vs out-of-state)
    const st = (r.contributor_state || "").toUpperCase();
    if (st && memberState && st === memberState.toUpperCase()) inStateAmt += amt;
    else outStateAmt += amt;

    // rough industry classification from memo/employer fields
    const ind =
      topIndustryFromMemo(r.memo_text) ||
      topIndustryFromMemo(r.contributor_employer) ||
      topIndustryFromMemo(r.employer) ||
      null;
    if (ind) industryBucket[ind] = (industryBucket[ind] || 0) + amt;
  }

  return { pacAmt, smallAmt, inStateAmt, outStateAmt, industryBucket };
}

async function build() {
  const { members } = await loadMembers();
  const donorsByMember = {};
  const voteAlignments = {};

  for (const m of Object.values(members)) {
    const fecIds = Array.isArray(m.fec_ids) ? m.fec_ids : [];
    if (!fecIds.length) continue;

    let pacAmt = 0, smallAmt = 0, inStateAmt = 0, outStateAmt = 0;
    const industryBucket = {};

    for (const candidateId of fecIds) {
      // sanity check FEC id shape (candidate IDs often look like H0WA10078, S2XX..., etc.)
      if (!/^[A-Z]\d[A-Z]{2}\d{5}$/.test(candidateId)) {
        console.warn("Skipping non‑FEC ID:", candidateId);
        continue;
      }

      const history = await committeesForCandidate(candidateId, CYCLE);
      for (const h of history) {
        const cid = h.committee_id;
        if (!cid) continue;

        const rows = await committeeReceipts(cid, CYCLE);
        const b = moneyBucketsFromScheduleA(rows, m.state);
        pacAmt      += b.pacAmt;
        smallAmt    += b.smallAmt;
        inStateAmt  += b.inStateAmt;
        outStateAmt += b.outStateAmt;

        for (const [k, v] of Object.entries(b.industryBucket)) {
          industryBucket[k] = (industryBucket[k] || 0) + v;
        }
      }
    }

    const denom = Math.max(pacAmt + smallAmt, 1);
    const pac_pct = pacAmt / denom;

    donorsByMember[m.id] = {
      pac_pct,
      in_state_dollars: inStateAmt,
      out_state_dollars: outStateAmt,
      industries: industryBucket,
      receipts: [
        ...fecIds.map(fid => ({
          title: `FEC candidate ${fid}`,
          url: `https://www.fec.gov/data/candidate/${fid}/?cycle=${CYCLE}`
        }))
      ]
    };

    // Leave alignments empty for now (your voting logic can fill this)
    voteAlignments[m.id] = voteAlignments[m.id] || { donor_alignment_index: null, votes: [] };
  }

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/donors-by-member.json", JSON.stringify(donorsByMember, null, 2));
  await fs.writeFile("data/vote-alignments.json", JSON.stringify(voteAlignments, null, 2));
  console.log("wrote donors-by-member.json, vote-alignments.json");
}

build().catch(e => { console.error(e); process.exit(1); });

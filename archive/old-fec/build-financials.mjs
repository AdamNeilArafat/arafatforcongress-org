// scripts/build-financials.mjs
import fs from "node:fs/promises";

// --- config ---
const API   = "https://api.open.fec.gov/v1";
const CYCLE = 2024;
const FEC_KEY = process.env.FEC_API_KEY || "";

// polite delay: ~1.2s/request keeps you under 1000/hr comfortably
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PAUSE_MS = 1200;

// redact helper for logs
const redact = (k) => k ? `${k.slice(0,4)}…${k.slice(-4)}` : "(none)";

// Single getJSON that accepts string or URL; always appends api_key
async function getJSON(input) {
  const u = input instanceof URL ? input : new URL(input);
  if (FEC_KEY) u.searchParams.set("api_key", FEC_KEY);
  const res = await fetch(u, { headers: { "Accept": "application/json" } });
  const txt = await res.text();
  if (!res.ok) {
    console.error(`FEC ${res.status} → ${u.toString()}\n${txt.slice(0,400)}`);
    throw new Error(`${res.status} ${u.pathname}`);
  }
  try { return JSON.parse(txt); }
  catch (e) {
    console.error("JSON parse failed for", u.toString(), "body:", txt.slice(0,200));
    throw e;
  }
}

// Normalize members: array -> map keyed by bioguide/id
async function loadMembers() {
  const raw = await fs.readFile("data/members.json", "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    const map = {};
    for (const x of parsed) {
      const k = x.bioguide || x.bioguide_id || x.id || x.member_id;
      if (k) map[k] = x;
    }
    return { members: map };
  }
  return { members: parsed || {} };
}

// Candidate → committees (history for a cycle)
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
    await sleep(PAUSE_MS);
  }
  return out;
}

// Schedule A itemized receipts via keyset pagination
async function committeeReceipts(committeeId, cycle = CYCLE, maxPages = 20) {
  const results = [];
  const params = new URLSearchParams({
    committee_id: committeeId,
    two_year_transaction_period: String(cycle),
    sort: "-contribution_receipt_date",
    per_page: "100"
  });

  for (let i = 0; i < maxPages; i++) {
    const u = new URL(`${API}/schedules/schedule_a/`);
    for (const [k,v] of params) u.searchParams.set(k, v);

    const js = await getJSON(u);
    results.push(...(js.results || []));

    const li = js?.pagination?.last_indexes;
    if (!li || !li.last_index) break;

    params.set("last_index", String(li.last_index));
    if (li.last_contribution_receipt_date) {
      params.set("last_contribution_receipt_date", String(li.last_contribution_receipt_date));
    }
    await sleep(PAUSE_MS);
  }
  return results;
}

// Simple industry tagging heuristic
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
    const amt = Number(r.contribution_receipt_amount) || 0;

    // PAC vs small heuristic
    const entity = String(r.entity_type || "").toUpperCase(); // often IND, PAC, CCM, COM, etc.
    const isPAC = entity === "PAC" || !!r.contributor_committee_id ||
                  String(r.contributor_type || "").toLowerCase().includes("committee");
    const isIndividual = entity === "IND" || r.is_individual === true;

    if (isPAC) pacAmt += amt;
    else if (isIndividual) smallAmt += amt;

    // Geo — only count when we actually have a contributor_state
    const st = (r.contributor_state || "").toUpperCase();
    if (st) {
      if (memberState && st === String(memberState).toUpperCase()) inStateAmt += amt;
      else outStateAmt += amt;
    }

    const ind =
      topIndustryFromMemo(r.memo_text) ||
      topIndustryFromMemo(r.contributor_employer) ||
      topIndustryFromMemo(r.employer) || null;
    if (ind) industryBucket[ind] = (industryBucket[ind] || 0) + amt;
  }

  return { pacAmt, smallAmt, inStateAmt, outStateAmt, industryBucket };
}

function isCandidateId(s) { return /^[HSP]\d[A-Z]{2}\d{5}$/.test(String(s||"").toUpperCase()); }
function isCommitteeId(s) { return /^C\d{8}$/.test(String(s||"").toUpperCase()); }

async function build() {
  // If no key, write empty placeholders and exit successfully so the site ships.
  if (!FEC_KEY || FEC_KEY.length < 20) {
    console.warn(`No/short FEC_API_KEY (${redact(FEC_KEY)}). Writing empty placeholders.`);
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/donors-by-member.json", "{}");
    await fs.writeFile("data/vote-alignments.json", "{}");
    return;
  }

  const { members } = await loadMembers();
  const donorsByMember = {};
  const voteAlignments = {};

  for (const [mid, m] of Object.entries(members)) {
    try {
      const fecIds = Array.isArray(m.fec_ids) ? m.fec_ids : [];
      if (!fecIds.length) continue;

      let pacAmt = 0, smallAmt = 0, inStateAmt = 0, outStateAmt = 0;
      const industryBucket = {};

      for (const candidateId of fecIds) {
        if (!isCandidateId(candidateId)) {
          console.warn("Skipping non-candidate FEC ID:", candidateId);
          continue;
        }

        const history = await committeesForCandidate(candidateId, CYCLE);
        for (const h of history) {
          const cid = h.committee_id;
          if (!cid || !isCommitteeId(cid)) continue;

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

      donorsByMember[mid] = {
        pac_pct,
        in_state_dollars: inStateAmt,
        out_state_dollars: outStateAmt,
        industries: industryBucket,
        receipts: [
          ...fecIds.filter(isCandidateId).map(fid => ({
            title: `FEC candidate ${fid}`,
            url: `https://www.fec.gov/data/candidate/${fid}/?cycle=${CYCLE}`
          }))
        ]
      };

      // Placeholder; populate if/when you compute these elsewhere
      voteAlignments[mid] = voteAlignments[mid] || { donor_alignment_index: null, votes: [] };

    } catch (err) {
      console.error(`Member ${mid} failed:`, err?.message || err);
      // still write something so the page can render that member
      donorsByMember[mid] = donorsByMember[mid] || {
        pac_pct: 0, in_state_dollars: 0, out_state_dollars: 0, industries: {}, receipts: []
      };
      voteAlignments[mid] = voteAlignments[mid] || { donor_alignment_index: null, votes: [] };
    }
    await sleep(PAUSE_MS);
  }

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/donors-by-member.json", JSON.stringify(donorsByMember, null, 2));
  await fs.writeFile("data/vote-alignments.json", JSON.stringify(voteAlignments, null, 2));
  console.log("wrote data/donors-by-member.json, data/vote-alignments.json");
}

build().catch(e => { console.error(e); process.exit(1); });

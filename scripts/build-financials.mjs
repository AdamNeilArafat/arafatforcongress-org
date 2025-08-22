// scripts/build-financials.mjs
import fs from 'node:fs/promises';

const FEC_KEY = process.env.FEC_API_KEY;
if (!FEC_KEY) throw new Error('Missing FEC_API_KEY');

const API = 'https://api.open.fec.gov/v1';

// Load members to map fec_ids -> member
async function loadMembers() {
  const js = JSON.parse(await fs.readFile('data/members.json', 'utf8'));
  const members = js;
  const fecToMember = new Map();
  for (const m of Object.values(members)) {
    for (const fid of (m.fec_ids || [])) fecToMember.set(fid, m.id);
  }
  return { members, fecToMember };
}

async function getJSON(url) {
  const r = await fetch(url); // uses built-in fetch (Node 18+)
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// 1) Candidate → committees (for a given cycle)
async function committeesForCandidate(fecId, cycle = 2024, page = 1, acc = []) {
  const url = `${API}/candidate/${fecId}/committees/history/${cycle}/?api_key=${FEC_KEY}&page=${page}&per_page=50`;
  const js = await getJSON(url);
  const out = acc.concat(js.results || []);
  if (js.pagination && page < js.pagination.pages) {
    return committeesForCandidate(fecId, cycle, page + 1, out);
  }
  return out;
}

// 2) Committee receipts (summary by contributor type + state)
async function committeeReceipts(committeeId, cycle = 2024, page = 1, acc = []) {
  const url = `${API}/schedules/schedule_a/?api_key=${FEC_KEY}&committee_id=${committeeId}&two_year_transaction_period=${cycle}&per_page=100&page=${page}`;
  const js = await getJSON(url);
  const out = acc.concat(js.results || []);
  if (js.pagination && page < js.pagination.pages) {
    return committeeReceipts(committeeId, cycle, page + 1, out);
  }
  return out;
}

function sumBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    m.set(k, (m.get(k) || 0) + (x.contribution_receipt_amount || 0));
  }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

function topIndustryFromMemo(memo) {
  const s = (memo || '').toLowerCase();
  if (s.includes('pharma') || s.includes('biotech')) return 'pharma';
  if (s.includes('oil') || s.includes('gas') || s.includes('energy')) return 'oil';
  if (s.includes('defense') || s.includes('aerospace')) return 'defense';
  if (s.includes('bank') || s.includes('finance') || s.includes('hedge')) return 'finance';
  if (s.includes('tech') || s.includes('software') || s.includes('internet')) return 'tech';
  if (s.includes('aipac') || s.includes('israel')) return 'aipac';
  return null;
}

async function build() {
  const { members } = await loadMembers();
  const donorsByMember = {};
  const voteAlignments = {};

  for (const m of Object.values(members)) {
    const fecIds = m.fec_ids || [];
    if (!fecIds.length) continue;

    let pacAmt = 0, smallAmt = 0, inStateAmt = 0, outStateAmt = 0;
    const industryBucket = {};

    for (const fid of fecIds) {
      const comms = await committeesForCandidate(fid, 2024);
      for (const c of comms) {
        const recs = await committeeReceipts(c.committee_id, 2024);
        for (const r of recs) {
          const amt = r.contribution_receipt_amount || 0;
          const contributorType = (r.contributor_type || '').toLowerCase();
          const isPAC = contributorType.includes('committee') || contributorType.includes('pac') || r.contributor_committee_id;
          if (isPAC) pacAmt += amt; else smallAmt += amt;

          if (r.contributor_state && m.state && r.contributor_state.toUpperCase() === m.state.toUpperCase()) inStateAmt += amt;
          else outStateAmt += amt;

          const ind = topIndustryFromMemo(r.memo_text) || topIndustryFromMemo(r.contributor_employer) || topIndustryFromMemo(r.employer) || null;
          if (ind) industryBucket[ind] = (industryBucket[ind] || 0) + amt;
        }
      }
    }

    const totalSmallPac = Math.max(pacAmt + smallAmt, 1);
    const pac_pct = pacAmt / totalSmallPac;

    donorsByMember[m.id] = {
      pac_pct,
      in_state_dollars: inStateAmt,
      out_state_dollars: outStateAmt,
      industries: industryBucket,
      receipts: [
        ...fecIds.map(fid => ({
          title: `FEC candidate ${fid}`,
          url: `https://www.fec.gov/data/candidate/${fid}/?cycle=2024`
        }))
      ]
    };

    voteAlignments[m.id] = voteAlignments[m.id] || { donor_alignment_index: null, votes: [] };
  }

  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/donors-by-member.json', JSON.stringify(donorsByMember, null, 2));
  await fs.writeFile('data/vote-alignments.json', JSON.stringify(voteAlignments, null, 2));
  console.log('wrote donors-by-member.json, vote-alignments.json');
}

build().catch(e => { console.error(e); process.exit(1); });

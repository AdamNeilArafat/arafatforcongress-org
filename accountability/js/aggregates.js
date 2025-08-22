import { pct, money, sum, avg } from "./formatters.js";

export function computePacSmall(memberIds, donors) {
  const pacPcts = memberIds.map(id => donors[id]?.pac_pct ?? 0);
  const pacMean = avg(pacPcts);
  return { pac_pct: pacMean, small_pct: 1 - pacMean, label: `${pct(pacMean)}% PAC / ${100 - pct(pacMean)}% small` };
}

export function computeGeoTotals(memberIds, donors) {
  let inTotal = 0, outTotal = 0;
  for (const id of memberIds) {
    const d = donors[id] || {};
    inTotal += Number(d.in_state_dollars) || 0;
    outTotal += Number(d.out_state_dollars) || 0;
  }
  return { in_total: inTotal, out_total: outTotal, label: `${money(inTotal)} in / ${money(outTotal)} out` };
}

export function computeTopIndustry(memberIds, donors) {
  const bucket = {};
  let grand = 0;
  for (const id of memberIds) {
    const inds = donors[id]?.industries || {};
    for (const [k, v] of Object.entries(inds)) {
      bucket[k] = (bucket[k] || 0) + (Number(v) || 0);
      grand += Number(v) || 0;
    }
  }
  if (!grand) return { key: "—", share: 0, label: "—" };
  const top = Object.entries(bucket).sort((a,b)=>b[1]-a[1])[0];
  const share = top[1] / grand;
  return { key: top[0], share, label: `${top[0]} (${pct(share)}%)` };
}

export function computeVoteAlignment(memberIds, votes) {
  const arr = memberIds.map(id => votes[id]?.donor_alignment_index).filter(v => typeof v === "number");
  if (!arr.length) return { index: null, label: "—" };
  const mean = avg(arr);
  return { index: mean, label: `${pct(mean)}%` };
}

export function computeAllAggregates(memberIds, donors, votes) {
  return {
    pacSmall: computePacSmall(memberIds, donors),
    geo: computeGeoTotals(memberIds, donors),
    topIndustry: computeTopIndustry(memberIds, donors),
    voteAlign: computeVoteAlignment(memberIds, votes)
  };
}

// /assets/js/aggregates.js
// Filter-aware aggregations for headline cards and comparisons.

import { pct, pctStr, money, sum, avg, sumInto, topEntry } from "./formatters.js";

/**
 * Compute aggregate PAC vs small for a subset of members.
 * We only have `pac_pct` per member, not absolute totals; use a member-weighted mean.
 */
export function computePacSmall(memberIds, donorsByMember) {
  const pacPcts = memberIds.map(id => (donorsByMember[id]?.pac_pct ?? 0));
  const pacMean = avg(pacPcts); // 0..1
  return {
    pac_pct: pacMean,
    small_pct: 1 - pacMean,
    pac_label: `${pct(pacMean)}% PAC / ${100 - pct(pacMean)}% small`
  };
}

/** Sum in- vs out-of-state dollars over the subset. */
export function computeGeoTotals(memberIds, donorsByMember) {
  let inTotal = 0, outTotal = 0;
  for (const id of memberIds) {
    const d = donorsByMember[id] || {};
    inTotal += Number(d.in_state_dollars) || 0;
    outTotal += Number(d.out_state_dollars) || 0;
  }
  return {
    in_total: inTotal,
    out_total: outTotal,
    label: `${money(inTotal)} in / ${money(outTotal)} out`
  };
}

/** Sum industries across the subset and return the top one and its share. */
export function computeTopIndustry(memberIds, donorsByMember) {
  const bucket = {};
  let grand = 0;
  for (const id of memberIds) {
    const inds = (donorsByMember[id]?.industries) || {};
    sumInto(bucket, inds);
    grand += sum(Object.values(inds));
  }
  if (!grand) return { key: "—", share: 0, label: "—" };
  const [key, amt] = topEntry(bucket);
  const share = (amt || 0) / grand;
  return { key, share, label: `${key} (${pct(share)}%)` };
}

/** Average donor_alignment_index across the subset. */
export function computeVoteAlignment(memberIds, votesByMember) {
  const arr = memberIds.map(id => votesByMember[id]?.donor_alignment_index).filter(v => typeof v === "number");
  if (!arr.length) return { index: null, label: "—" };
  const mean = avg(arr);
  return { index: mean, label: pctStr(mean) };
}

/** Build a full aggregate snapshot used by top cards. */
export function computeAllAggregates(memberIds, donorsByMember, votesByMember) {
  return {
    pacSmall: computePacSmall(memberIds, donorsByMember),
    geo: computeGeoTotals(memberIds, donorsByMember),
    topIndustry: computeTopIndustry(memberIds, donorsByMember),
    voteAlign: computeVoteAlignment(memberIds, votesByMember)
  };
}

// /assets/js/data-loader.js
// Centralized fetcher for site-wide datasets. Caches in-memory per page load.

const DATA_BASE = "/accountability/data";
const FILES = {
  members: "members.json",
  donors: "donors-by-member.json",
  awards: "member-awards.json",
  votes: "vote-alignments.json",
  meta: "meta.json" // optional; if missing we still work
};

const cache = {};

/** Fetch JSON with optional cache-buster */
async function fetchJSON(file, bust = "") {
  const url = `${DATA_BASE}/${file}${bust ? `?v=${encodeURIComponent(bust)}` : ""}`;
  const r = await fetch(url, { credentials: "omit", cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load ${file}: ${r.status}`);
  return r.json();
}

/** Load meta (if present), then load all datasets with a stable cache-buster */
export async function getData() {
  if (cache.__loaded) return cache.__loaded;

  let meta = {};
  try { meta = await fetchJSON(FILES.meta); } catch { /* meta optional */ }

  const bust = meta.build_id || meta.etag || "";
  const [members, donors, awards, votes] = await Promise.all([
    fetchJSON(FILES.members, bust),
    fetchJSON(FILES.donors, bust),
    fetchJSON(FILES.awards, bust),
    fetchJSON(FILES.votes, bust)
  ]);

  cache.members = members || {};
  cache.donors = donors || {};
  cache.awards = awards || {};
  cache.votes = votes || {};
  cache.meta = meta || {};

  cache.__loaded = {
    members: cache.members,
    donors: cache.donors,
    awards: cache.awards,
    votes: cache.votes,
    meta: cache.meta
  };
  return cache.__loaded;
}

/** Light helper to get an array of visible Bioguide IDs from a NodeList of rows */
export function getVisibleIdsFromTable(tableBodyEl) {
  return Array.from(tableBodyEl.querySelectorAll("tr[data-mid]"))
    .filter(tr => tr.style.display !== "none")
    .map(tr => tr.getAttribute("data-mid"));
}

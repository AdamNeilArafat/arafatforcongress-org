// Centralized fetcher for /accountability/data/*.json
const DATA_BASE = "/accountability/data";
const FILES = {
  members: "members.json",
  donors: "donors-by-member.json",
  awards: "member-awards.json",
  votes: "vote-alignments.json",
  meta: "meta.json"
};

const cache = {};
async function fetchJSON(file, bust = "") {
  const url = `${DATA_BASE}/${file}${bust ? `?v=${encodeURIComponent(bust)}` : ""}`;
  const r = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!r.ok) throw new Error(`Failed to load ${file}: ${r.status}`);
  return r.json();
}

export async function getData() {
  if (cache.__loaded) return cache.__loaded;
  let meta = {};
  try { meta = await fetchJSON(FILES.meta); } catch {}
  const bust = meta.build_id || "";

  const [members, donors, awards, votes] = await Promise.all([
    fetchJSON(FILES.members, bust),
    fetchJSON(FILES.donors, bust),
    fetchJSON(FILES.awards, bust),
    fetchJSON(FILES.votes, bust)
  ]);

  cache.__loaded = { members, donors, awards, votes, meta };
  return cache.__loaded;
}

export function getVisibleIdsFromTable(tbody) {
  return Array.from(tbody.querySelectorAll("tr[data-mid]"))
    .filter(tr => tr.style.display !== "none")
    .map(tr => tr.getAttribute("data-mid"));
}

// /assets/js/guards.js
// Basic schema checks to catch mismatched keys or missing fields during development.

function keys(obj) { return new Set(Object.keys(obj || {})); }

export function assertSchemas({ members, donors, votes, awards }, { strict = false } = {}) {
  const mk = keys(members);
  const dk = keys(donors);
  const vk = keys(votes);
  const ak = keys(awards);

  const unknownInDonors = [...dk].filter(k => !mk.has(k));
  const unknownInVotes  = [...vk].filter(k => !mk.has(k));
  const unknownInAwards = [...ak].filter(k => !mk.has(k));

  if (unknownInDonors.length) console.warn("Donors keys not found in members:", unknownInDonors.slice(0, 10), "…");
  if (unknownInVotes.length)  console.warn("Votes keys not found in members:", unknownInVotes.slice(0, 10), "…");
  if (unknownInAwards.length) console.warn("Awards keys not found in members:", unknownInAwards.slice(0, 10), "…");

  if (strict && (unknownInDonors.length || unknownInVotes.length || unknownInAwards.length)) {
    throw new Error("Schema guard failed: dataset keys out of sync with members.");
  }

  // Spot-check required member fields
  for (const [id, m] of Object.entries(members || {})) {
    if (!m.name || !m.chamber || !m.state) {
      console.warn(`Member ${id} missing required fields (name/chamber/state)`, m);
    }
  }
}

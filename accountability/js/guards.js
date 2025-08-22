function keys(obj) { return new Set(Object.keys(obj || {})); }

export function assertSchemas({ members, donors, votes, awards }, { strict = false } = {}) {
  const mk = keys(members), dk = keys(donors), vk = keys(votes), ak = keys(awards);
  const miss = (setA, setB) => [...setA].filter(k => !setB.has(k));
  const uDon = miss(dk, mk), uVote = miss(vk, mk), uAwr = miss(ak, mk);

  if (uDon.length) console.warn("Donors keys not in members:", uDon.slice(0,10), "…");
  if (uVote.length) console.warn("Votes keys not in members:", uVote.slice(0,10), "…");
  if (uAwr.length) console.warn("Awards keys not in members:", uAwr.slice(0,10), "…");
  if (strict && (uDon.length || uVote.length || uAwr.length)) {
    throw new Error("Schema guard failed: dataset keys out of sync with members.");
  }
}

import fs from "node:fs/promises";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const committeesPath = "data/site/committees.json";
const candidatesPath = "data/site/candidates.json";

// Turn arrays or ID-keyed maps into a plain array and ensure an id field exists.
function toArrayWithId(parsed, idField, knownKeys = []) {
  if (Array.isArray(parsed)) {
    return parsed.map((o) => {
      if (o && typeof o === "object" && !o[idField]) {
        // Try to infer from common fields if present
        for (const k of knownKeys) if (o[k]) { o[idField] = o[k]; break; }
      }
      return o;
    });
  }
  if (parsed && typeof parsed === "object") {
    // Map keyed by id -> attach key as idField
    return Object.entries(parsed).map(([k, v]) => {
      if (v && typeof v === "object" && !v[idField]) v[idField] = k;
      return v;
    });
  }
  return [];
}

const committeeSchema = {
  type: "object",
  properties: {
    committee_id: { type: "string" },
    headline: { type: "string" },
    "3_takeaways": { type: "array", items: { type: "string" } },
    donor_mix_summary: { type: "string" },
    risk_flags: { type: "array", items: { type: "string" } }
  },
  required: ["committee_id", "headline", "3_takeaways", "donor_mix_summary", "risk_flags"],
  additionalProperties: false
};

const candidateSchema = {
  type: "object",
  properties: {
    candidate_id: { type: "string" },
    elevator: { type: "string" },
    money_influence: { type: "string" },
    receipts_caption: { type: "string" }
  },
  required: ["candidate_id", "elevator", "money_influence", "receipts_caption"],
  additionalProperties: false
};

async function callJSONSchema(inputMsgs, name, schema) {
  const r = await client.responses.create({
    model: "gpt-5",
    input: inputMsgs,
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }
  });
  const text = r.output?.[0]?.content?.[0]?.text ?? "{}";
  return JSON.parse(text);
}

async function main() {
  const [committeesRaw, candidatesRaw] = await Promise.all([
    fs.readFile(committeesPath, "utf8"),
    fs.readFile(candidatesPath, "utf8")
  ]);

  const committeesParsed = JSON.parse(committeesRaw);
  const candidatesParsed = JSON.parse(candidatesRaw);

  const committees = toArrayWithId(committeesParsed, "committee_id", ["committee_id", "id"]);
  const candidates  = toArrayWithId(candidatesParsed,  "candidate_id",  ["candidate_id", "id"]);

  if (!committees.length) {
    console.error("No committees found. Inspect data/site/committees.json to confirm its shape.");
    process.exit(2);
  }
  if (!candidates.length) {
    console.error("No candidates found. Inspect data/site/candidates.json to confirm its shape.");
    process.exit(2);
  }

  // Throttle during testing to save tokens
  const MAX_ITEMS = parseInt(process.env.AI_MAX_ITEMS || "5", 10);
  const cCommittees = committees.slice(0, MAX_ITEMS);
  const cCandidates = candidates.slice(0, MAX_ITEMS);

  console.log(`Analyzing ${cCommittees.length}/${committees.length} committees and ${cCandidates.length}/${candidates.length} candidates...`);

  const committeeAnalyses = [];
  for (const c of cCommittees) {
    const msgs = [
      { role: "system", content: "You analyze FEC committee data. Be concise, factual, and neutral." },
      { role: "user", content: JSON.stringify(c) }
    ];
    const out = await callJSONSchema(msgs, "CommitteeAnalysis", committeeSchema);
    if (!out.committee_id && c.committee_id) out.committee_id = c.committee_id;
    committeeAnalyses.push(out);
  }

  const candidateAnalyses = [];
  for (const p of cCandidates) {
    const msgs = [
      { role: "system", content: "You write short, accessible summaries from FEC aggregates." },
      { role: "user", content: JSON.stringify(p) }
    ];
    const out = await callJSONSchema(msgs, "CandidateAnalysis", candidateSchema);
    if (!out.candidate_id && p.candidate_id) out.candidate_id = p.candidate_id;
    candidateAnalyses.push(out);
  }

  await fs.mkdir("data/ai", { recursive: true });
  await fs.writeFile("data/ai/committee_analyses.json", JSON.stringify(committeeAnalyses, null, 2));
  await fs.writeFile("data/ai/candidate_analyses.json", JSON.stringify(candidateAnalyses, null, 2));

  console.log("AI analyses written to data/ai/*");
}

main().catch(e => { console.error(e); process.exit(1); });

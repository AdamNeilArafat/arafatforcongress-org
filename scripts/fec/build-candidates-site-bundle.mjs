import fs from "node:fs";
import readline from "node:readline";

const inFile  = "data/warehouse/dim_candidates.jsonl";
const outFile = "data/site/candidates.json";

async function run() {
  if (!fs.existsSync(inFile)) {
    console.error(`Missing ${inFile}. Run your warehouse step first.`);
    process.exit(2);
  }
  await fs.promises.mkdir("data/site", { recursive: true });

  const map = {};
  const rl = readline.createInterface({
    input: fs.createReadStream(inFile, "utf8"),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t);
      const id =
        obj.candidate_id || obj.id || obj.candidate || obj.cand_id || obj.candId;
      if (!id) continue;
      // Keep the full object for now; your site can pick fields as needed.
      map[id] = obj;
    } catch (e) {
      console.error("Bad JSONL line:", e.message);
    }
  }

  await fs.promises.writeFile(outFile, JSON.stringify(map, null, 2));
  console.log(`Wrote ${outFile} with ${Object.keys(map).length} candidates`);
}

run().catch(e => { console.error(e); process.exit(1); });

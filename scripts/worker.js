// worker.js — Cloudflare Worker: append votes & clear badges (NO admin key)
// Secrets/Vars to set in Worker:
// - GH_TOKEN   : GitHub PAT with contents:write for the repo
// - REPO       : "owner/repo"  (e.g., "AdamNeilArafat/arafatforcongress-org")
// - BRANCH     : "main"
// - FILE_VOTES : "data/votes_append.json"   (optional; default shown)
// - FILE_AWARDS: "data/member-awards.json"  (optional; default shown)
// - ALLOW_ORIGIN: optional CORS allowlist origin (e.g., "https://arafatforcongress.org"); if omitted, uses "*"

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const allow = env.ALLOW_ORIGIN || "*";
    const origin = req.headers.get("Origin") || "";
    const allowOrigin = allow === "*" ? "*" : (origin === allow ? origin : "");

    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (req.method === "OPTIONS") {
      return new Response("", { headers: cors });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: cors });
    }

    // Parse JSON once
    let body;
    try { body = await req.json(); }
    catch { return new Response("Bad JSON", { status: 400, headers: cors }); }

    const [owner, repo] = (env.REPO || "").split("/");
    const branch = env.BRANCH || "main";
    const votesPath = env.FILE_VOTES || "data/votes_append.json";
    const awardsPath = env.FILE_AWARDS || "data/member-awards.json";
    const token = env.GH_TOKEN;
    if (!owner || !repo || !token) {
      return new Response("Server not configured", { status: 500, headers: cors });
    }

    // GitHub helpers
    const gh = async (url, init = {}) => {
      const r = await fetch(url, {
        ...init,
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${token}`,
          ...(init.headers || {})
        }
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`GitHub ${r.status}: ${t}`);
      }
      return r.json();
    };
    const enc = s => btoa(unescape(encodeURIComponent(s)));
    const dec = b64 => decodeURIComponent(escape(atob(b64)));

    // Read a JSON file from repo (returns {exists, sha, json})
    const readJson = async (filePath) => {
      try {
        const obj = await gh(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`);
        const json = JSON.parse(dec(obj.content || "")) || (Array.isArray(obj) ? [] : {});
        return { exists: true, sha: obj.sha, json };
      } catch (e) {
        if (String(e).includes("404")) return { exists: false, sha: null, json: Array.isArray(filePath) ? [] : (filePath.endsWith(".json") ? (filePath.includes("votes") ? [] : {}) : {}) };
        throw e;
      }
    };

    // Write a JSON file to repo
    const writeJson = async (filePath, sha, content, message) => {
      const bodyPut = {
        message,
        content: enc(JSON.stringify(content, null, 2)),
        branch
      };
      if (sha) bodyPut.sha = sha;
      await gh(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPut)
      });
    };

    try {
      if (path.endsWith("/api/append-votes")) {
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) return new Response("No rows", { status: 400, headers: cors });

        // Load existing votes
        let { exists, sha, json } = await readJson(votesPath);
        if (!Array.isArray(json)) json = [];

        // Dedupe: member_id|bill_id|vote_date
        const key = r => `${r.member_id}|${r.bill_id}|${r.vote_date}`;
        const seen = new Set(json.map(key));
        let appended = 0;
        for (const r of rows) {
          if (!r.member_id || !r.bill_id || !r.vote_date || !r.vote) continue;
          const k = key(r);
          if (!seen.has(k)) { json.push(r); seen.add(k); appended++; }
        }

        await writeJson(
          votesPath,
          exists ? sha : null,
          json,
          `chore(admin): append ${rows.length} vote row(s) (deduped: +${appended})`
        );
        return new Response(JSON.stringify({ ok: true, appended }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

      if (path.endsWith("/api/clear-badges")) {
        const members = Array.isArray(body?.members) ? body.members : [];
        if (!members.length) return new Response("No members", { status: 400, headers: cors });

        // Load awards JSON (object keyed by member id)
        let { exists, sha, json } = await readJson(awardsPath);
        if (!json || Array.isArray(json)) json = {}; // normalize to object

        let changed = 0;
        for (const mid of members) {
          if (!mid) continue;
          if (!json[mid] || (Array.isArray(json[mid]?.badges) && json[mid].badges.length === 0)) {
            // If absent, no-op; if already empty, no change
            json[mid] = { badges: [] };
          } else {
            json[mid] = { badges: [] };
            changed++;
          }
        }

        await writeJson(
          awardsPath,
          exists ? sha : null,
          json,
          `chore(admin): clear badges for ${members.length} member(s) (changed: ${changed})`
        );
        return new Response(JSON.stringify({ ok: true, changed }), { status: 200, headers: { "Content-Type": "application/json", ...cors } });
      }

      return new Response("Not Found", { status: 404, headers: cors });
    } catch (e) {
      return new Response(String(e), { status: 500, headers: cors });
    }
  }
};

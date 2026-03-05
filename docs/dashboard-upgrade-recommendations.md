# Dashboard Upgrade Recommendations, Fix Plan, and Service Levels

## Phase 0 Audit Summary

### Stack summary
- Frontend: React + Vite + TypeScript app mounted from `src/main.tsx`.
- CSV parsing: `papaparse` in browser.
- Current storage pattern (main app): browser `localStorage` (`afc_uploaded_voter_rows`).
- Parallel silo app: Node HTTP server with JSON-file persistence at `apps/voter-mapping-silo/data/store.json`.
- DB/Migrations status: Supabase migration exists, but is not wired into active dashboard flows.

### Current import path (main app)
1. CSV is uploaded in `src/pages/admin/upload.tsx`.
2. Parse/validation runs in `src/lib/csv/parse.ts` + `src/lib/csv/schema.ts`.
3. Parsed rows are stored only in localStorage via `saveUploadedRows` in `src/lib/csv/storage.ts`.
4. The admin report reads those localStorage rows in `src/pages/admin/dashboard.tsx`.

### Current operational dataset queries
- Volunteer map page is static placeholder data (`points={[{ id: '1', label: 'Example household' }]}`) in `src/pages/volunteer/map.tsx`.
- Calls page is static sample (`Sample Voter`) in `src/pages/volunteer/calls.tsx`.
- Texts page is static template merge preview in `src/pages/volunteer/texts.tsx`.
- In the silo app, map features read from `store.households`; queues read from `store.callQueue`/`store.textQueue`; imports populate `store.voters` + `store.households` in `apps/voter-mapping-silo/server.js`.

### Root-cause diagnosis for “Imported 19 households” but 0 visible
1. **Dataset split / source-of-truth mismatch:** active UI modules are placeholders and not reading import-backed records.
2. **Import success ≠ operational readiness:** status text can indicate import activity, but no end-to-end verification that map/call/text screens query inserted records.
3. **Potential wrong-table/read-model coupling:** silo map consumes households while other modules can rely on queues; no canonical voter-based read model for all modules.
4. **No explicit pending geocode UX in core UI:** if records have no valid coordinates, map appears empty without a clear pending-state explanation.
5. **No post-import consistency gate:** no guaranteed check of “inserted_count in DB == queryable rows used by app modules.”

---

## Upgrade/Fix Recommendations (Priority-Ordered)

### P0 (Immediate)
1. **Adopt one canonical operational schema** (imports, voters, outreach_logs, audit_logs) and retire localStorage/json-file as the operational truth.
2. **Replace current upload success message with DB-verified summary** (inserted, duplicates, invalid, pinned, pending geocode).
3. **Make map/calls/text all query `voters` with module-specific filters** (instead of placeholders or disconnected datasets).
4. **Implement soft-delete controls** (single voter delete, clear by import, clear all) with audit logs.
5. **Add post-import verification transaction step**: mark import failed when inserted rows are not queryable.

### P1 (Next)
1. Mapping template persistence and reusable column mappings.
2. Background geocoding queue for missing coordinates.
3. Queue provider abstraction for text sending with mock + Twilio adapter.
4. Basic integration tests for import->list->map and import->phone/text pipelines.

### P2 (Later)
1. Auth separation (admin vs volunteer) and role-based access controls.
2. Assignment/turf optimization improvements.
3. Performance work: server-side pagination, clustering optimization, background jobs.

---

## Recommended Target Architecture (Text Diagram)

```
CSV Upload UI
  -> Import API
      -> Parse + Validate + Deduplicate
      -> DB transaction:
           imports (processing)
           voters (append records)
           imports (complete/failed + verified counts)
           audit_logs

Read paths (single DB source)
  -> Voter list: voters (active only)
  -> Map: voters where valid latitude/longitude
  -> Phone bank: voters where phone present and do_not_contact=false
  -> Text bank: voters where phone present and do_not_contact=false
  -> Voter detail: outreach_logs by voter_id

Write paths
  -> Door/Phone/Text outcomes -> outreach_logs
  -> Deletes/Clears -> soft delete on voters/outreach_logs + audit_logs
```

---

## Level of Service Recommendations

### Level 1 — Stabilize (1–2 weeks)
- Goal: stop false-positive imports and ensure records appear in list/map/phone/text.
- Includes: canonical DB wiring, append imports, dedupe, verification gate, basic delete controls.
- Best for: immediate campaign operations reliability.

### Level 2 — Operate (2–4 weeks)
- Goal: production-ready operational flow for daily field work.
- Includes: Level 1 + geocode pipeline, import templates, outreach timeline UX, queue abstractions, integration tests.
- Best for: active canvassing/phone/text at scale.

### Level 3 — Scale & Govern (4–8 weeks)
- Goal: resilient multi-operator system with controls and observability.
- Includes: Level 2 + RBAC/auth separation, stronger audit/reporting, job workers, error budgets/SLO dashboards.
- Best for: sustained campaign operations with multiple teams.

---

## Suggested SLOs by Service Level

- **Import correctness SLO**
  - L1: 99% of completed imports have matching inserted/queryable counts.
  - L2+: 99.9% with automated reconciliation checks.
- **Operational data freshness SLO**
  - L1: new imported voters queryable in < 60 seconds.
  - L2+: < 10 seconds.
- **Outreach logging durability SLO**
  - L1: no silent write failures; errors surfaced to UI.
  - L2+: retry + dead-letter workflow for async provider operations.


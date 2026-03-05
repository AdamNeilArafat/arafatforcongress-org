# Phase 0 Audit Report

## A) Stack summary
- Frontend: React + Vite + TypeScript single-page app mounted from `src/main.tsx`.
- Backend/API: none in runtime app; current implementation was browser-only parsing and localStorage storage.
- DB: Supabase SQL migration exists, but runtime UI was not querying Supabase. Operational pages used hard-coded sample records.
- Jobs/queues: placeholder geocoding job file exists but not wired.

## B) Architecture diagram (before fix)
```
CSV file upload (admin/upload.tsx)
  -> parseCsvText()
  -> saveUploadedRows() to browser localStorage key
  -> dashboard report reads localStorage summary only

Map page (volunteer/map.tsx)
  -> hardcoded [{ id: '1', label: 'Example household' }]

Phone page (volunteer/calls.tsx)
  -> hardcoded "Sample Voter"

Text page (volunteer/texts.tsx)
  -> hardcoded merged script for "Neighbor"
```

## C) Gap list
- P0 gaps:
  1. No canonical runtime database source for imports + map + phone + text.
  2. Import path had no DB insert transaction or post-import verification.
  3. Multi-file stacking/dedupe not implemented.
  4. Map/phone/text did not query imported records.
  5. No clear-all / clear-by-import / row-delete flow tied to same data model.
- P1 gaps:
  1. Geocode queue/status UX was placeholder only.
  2. Template persistence for mapping/text absent.
- P2 gaps:
  1. RBAC/auth split was present in old Supabase migration but not connected to app runtime.

## D) Root-cause diagnosis for "Imported 19 households, visible 0"
1. **Import was audit/report only**: upload persisted parsed rows only to browser localStorage via `saveUploadedRows` and never inserted records into an operational voters table.
2. **Operational pages ignored uploaded data**: map/phone/text screens rendered static sample data, not imported records.
3. **No post-import verification**: app reported processed counts from parser, not verified DB queryable insert counts.
4. **No pinned/pending explanation**: map had no coordinate-aware status messaging, so users saw effectively empty operational context.

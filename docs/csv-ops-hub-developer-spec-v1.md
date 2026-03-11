# CSV Ops Hub — Developer Spec v1

## 1) Architecture Contract
- **Frontend**: React + Vite + Tailwind pages under `src/pages/*`.
- **Backend/API**: route handlers for import, queueing, assignments, and outcome logging.
- **Data**: PostgreSQL/Supabase as single source of truth.
- **Jobs**: async workers for import parse, dedupe, geocode, scoring, and outbound sends.

The architectural rule: **no module-specific shadow state**. All modules must persist to shared voter/household/contact tables.

---

## 2) Minimum Data Model Additions

Implement (or align existing tables to) the following entities:

1. `imports`
   - file metadata, hash, schema map, row counts, merge mode, status.
2. `voters`
   - canonical person record, support level, follow-up state, assignment pointers.
3. `households`
   - normalized address + geocode + household-level status fields.
4. `phones`, `emails`
   - normalized channel records per voter with validity flags.
5. `contact_attempts`
   - immutable append-only log for every outreach attempt.
6. `result_codes`
   - controlled taxonomy shared across all modules.
7. `scripts`
   - versioned script/template bodies per channel.
8. `suppression_entries`
   - per-channel do-not-contact entries with source and audit metadata.
9. `assignments`
   - volunteer work allocation, state transitions, due dates.
10. `routes`
    - generated route metadata, stop ordering, completion telemetry.
11. `flyer_scores`
    - weighted score factors + final priority tier.
12. `follow_up_queue`
    - unified queue fed by all module outcomes.
13. `audit_logs`
    - admin overrides and sensitive state changes.

### Hard constraints
- `contact_attempts` is append-only (no destructive updates).
- `result_code` must be FK-constrained to `result_codes`.
- suppression checks run before outbound send for every channel.
- voter merges preserve original import references.

---

## 3) Canonical Result Taxonomy (v1)

Required `result_codes` seeds:
- `contacted`
- `no_contact`
- `supporter`
- `undecided`
- `opposed`
- `follow_up`
- `opt_out`
- `bad_data`
- `moved`
- `wrong_number`
- `bad_email`
- `donation_lead`
- `yard_sign_lead`
- `volunteer_lead`
- `deceased`
- `do_not_call`
- `inaccessible`
- `literature_left`

Every module may show channel-specific labels, but must map to this taxonomy for reporting.

---

## 4) API Requirements (v1)

### Import APIs
- `POST /api/imports`
  - upload CSV, map fields, start async ingest job.
- `POST /api/imports/:id/reprocess`
  - rerun merge with selected strategy.
- `GET /api/imports/:id/report`
  - counts, dedupe decisions, invalid rows, geocode coverage.

### Queue + Assignment APIs
- `POST /api/assignments/batch`
- `POST /api/assignments/:id/release`
- `POST /api/assignments/rebalance`
- `GET /api/queues/:channel`

### Outreach Logging APIs
- `POST /api/outreach/attempts`
  - logs outcome, updates derived voter/household status, writes follow-up items.
- `POST /api/outreach/optout`
  - creates suppression entry + audit event.

### Reporting APIs
- `GET /api/reports/summary`
- `GET /api/reports/channel-breakdown`
- `GET /api/reports/volunteer-productivity`
- `GET /api/reports/follow-up`

---

## 5) Module Completion Checklist

### Text banking
- queue + script panel + preview + result buttons.
- STOP/END/QUIT/UNSUBSCRIBE detection.
- auto suppression + no-send enforcement.

### Phone banking
- script panel, rebuttal notes, call timer, next-contact workflow.
- standard result button set mapped to canonical taxonomy.

### Email banking
- templates + merge fields + send logs.
- unsubscribe/bounce suppression and reporting.

### Canvassing
- map/list toggle, household mode, door outcomes, walk packet export.

### Flyer ops
- score-based targeting, route assignment, delivery outcomes.

---

## 6) Flyer Score v1 Formula

`flyer_priority_score =`
- `(foot_traffic * 0.20)`
- `+ (vehicle_visibility * 0.15)`
- `+ (corner_exposure * 0.10)`
- `+ (multi_unit_density * 0.15)`
- `+ (access_ease * 0.10)`
- `+ (parking_ease * 0.05)`
- `+ (proximity_transit_commercial * 0.15)`
- `+ (repeat_visibility * 0.10)`

Tiering:
- `>= 80`: premium visibility
- `60–79`: strong visibility
- `40–59`: standard drop
- `< 40`: low priority
- override flag: inaccessible/skip

Admin must be able to tune all weights.

---

## 7) Page-by-Page Delivery (v1)

### Admin
- `/admin/dashboard`: KPI cards + map + follow-up alerts.
- `/admin/upload`: CSV import wizard + field mapping + validation report.
- `/admin/scripts`: script/template manager with versioning.
- `/admin/turfs`: territory drawing + assignment.
- `/admin/geocoding`: geocode queue status + retry controls.
- `/admin/suppression` (new): cross-channel suppression manager.
- `/admin/reports` (new): channel/script/volunteer/precinct analytics.

### Volunteer
- `/volunteer/map`: assigned route map + stop actions.
- `/volunteer/texts`: queue + script + result actions.
- `/volunteer/calls`: queue + script + call outcomes.
- `/volunteer/follow-ups` (new): prioritized callback/respond tasks.

---

## 8) Phase Plan

### Phase 1 — Data Integrity + Compliance
- result taxonomy enforcement
- suppression enforcement middleware
- unified follow-up queue
- re-import merge safety

### Phase 2 — Workflow Unification
- shared assignment queue for calls/texts/canvass
- script-first UX standardization
- coordinator reassignment console

### Phase 3 — Optimization + Analytics
- flyer score engine + overlays
- script performance reporting
- volunteer leaderboard + SLA follow-up metrics


# CSV Ops Hub — Senior Review and Improvement Kickoff (March 2026)

## Executive Assessment

The repo has a strong **foundation** for a CSV-first campaign operations platform, but the implementation is currently best described as an **early field-ops scaffold** rather than a unified production hub.

### What is already strong
- CSV ingestion + normalization utilities are present in `src/lib/csv/*` and tested in `src/tests/*`.
- Geocoding abstraction and worker jobs exist (`src/lib/geocoding/*`, `src/jobs/*`).
- Dashboard/admin and volunteer pages exist for key workflows (`src/pages/admin/*`, `src/pages/volunteer/*`).
- Initial role model and contact logging are present in Supabase migrations (`supabase/migrations/*`).

### What is partially implemented (needs hardening)
- Unified source-of-truth behavior exists conceptually, but write paths are still fragmented across modules.
- Assignment and route workflows exist at the UI/schema level, but not yet as an end-to-end queueing system with stale-work reassignment.
- Outreach tracking exists, but channel-specific compliance behavior and standardized coding are incomplete.

### Critical gaps vs target product standard
1. **CSV Master Record Discipline**: no enforced, canonical merge contract across import/re-import cycles.
2. **Suppression & Compliance**: no full cross-channel suppression model for text/email/phone with audited overrides.
3. **DNC-Style Workflow UX**: modules exist but need script-first queue UX with standardized result buttons everywhere.
4. **Flyer Intelligence**: no implemented weighted scoring model for visibility/traffic/access.
5. **Email Banking**: schema and page-level placeholders exist, but no complete send + result pipeline.
6. **Unified Follow-up Queue**: no cross-channel follow-up inbox with SLA-style prioritization.
7. **Reporting Taxonomy**: no immutable result dictionary enforced at DB + API + UI levels.

---

## Improvement Strategy (Start Now)

### Track A — Data & Compliance Backbone (highest priority)
- Introduce a canonical action/result taxonomy table and enforce foreign-key usage in outreach logs.
- Add channel suppression entities (text/email/phone) with source, reason, timestamp, and override audit.
- Add a re-import merge contract:
  - `source_external_id` + deterministic dedupe keys.
  - append-only import history.
  - no destructive overwrite of contact history.

### Track B — Unified Operator Workflow
- Implement one queue engine used by calls, texts, emails, canvass, and flyer tasks.
- Ensure each queue item contains:
  - assignment state,
  - script/template reference,
  - due date,
  - result submission contract.
- Add stale assignment auto-release + coordinator reassignment tools.

### Track C — Outreach Module Completion
- Text banking: opt-out keyword automation + suppression write-through + inbox triage.
- Phone banking: standardized button matrix + call timer + scripted rebuttal panel.
- Email banking: template send log, unsubscribe, bounce handling, and follow-up tagging.
- Canvass/flyer: household mode + route completion and inaccessible/refused outcomes.

### Track D — Scoring, Analytics, and Ops Visibility
- Flyer scoring v1 (weight-based and admin tunable).
- Priority score v1 (turnout + persuasion + contactability + flyer visibility).
- Unified analytics dimensions: by channel, script, volunteer, precinct, date.

---

## 30/60/90 Day Plan

### First 30 days (stability + compliance)
- Lock canonical result code dictionary.
- Ship suppression list data model and enforcement middleware.
- Ship unified follow-up queue (read/write path only, minimal UI).
- Add CSV re-import merge safeguards and idempotency checks.

### 31–60 days (workflow velocity)
- Convert calls/texts/canvass to shared queue UX with script sidecar.
- Add coordinator assignment console and stale-work automation.
- Deliver email banking MVP (templated sends + unsubscribes + result coding).

### 61–90 days (optimization)
- Release flyer scoring and territory targeting overlays.
- Add script A/B reporting and volunteer productivity scorecards.
- Add offline/mobile canvass capture with sync reconciliation.

---

## Definition of “Improved” (Acceptance Criteria)

A build should not be considered production-ready until all are true:
- Every module reads/writes the same voter + household profile timeline.
- Every outreach outcome maps to a single standardized taxonomy.
- Opt-out and suppression are automatically enforced for text/email/phone.
- Re-importing CSV does not destroy historical outreach or notes.
- Coordinators can assign/reassign work and view completion in real time.
- Managers can run cross-channel reports without custom data cleanup.

---

## Immediate Next Implementation Step

Use `docs/csv-ops-hub-developer-spec-v1.md` as the execution contract for engineering tickets. That spec translates product intent into table-level, API-level, and page-level requirements for incremental delivery.

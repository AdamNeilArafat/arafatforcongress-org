# Secure Voter Mapping Silo Proposal (Pierce + Thurston)

## Goal
Build a **separate, siloed field-ops test site** where campaign staff can:
1. Upload county voter files (CSV).
2. Geocode addresses into map pins.
3. Cluster nearby addresses and show heat-map density at low zoom.
4. Expand clusters into household-level icons as users zoom in.
5. Click a pin/household to log canvass actions, notes, and follow-up status.

This design keeps county voter rolls isolated from the public campaign website and supports future migration to production after security review.

---

## Product Behavior (What you asked for)

### 1) “Mark any place on the map and have it logged”
- Add a **map annotation mode** for staff to drop manual pins anywhere (issues, event venues, turf boundaries, safety notes).
- Every marker is persisted with:
  - lat/lng
  - marker type (household, event, issue, volunteer note, etc.)
  - created_by + timestamp
  - free-text note + optional follow-up date

### 2) “Plug in voter rolls from the state listing”
- Provide secure CSV import flow (Pierce and Thurston files separately).
- Map CSV columns to internal schema:
  - voter_id (or generated hash)
  - first_name, last_name
  - address fields
  - party registration
  - precinct/ward if available
- Validate malformed rows and produce import report (accepted/rejected counts + row numbers).

### 3) “Each pin or address clustered for people that live together”
- Deduplicate into a **Household** entity by normalized address.
- Household contains 1..N voters.
- Map behavior:
  - Low zoom: heat layer + large clusters.
  - Mid zoom: smaller clusters with count badges.
  - High zoom: individual household icons (click reveals voter roster + status).

### 4) “Heat map zoom in and expands into houses, with icons to click on and mark”
- Use a stacked map visualization:
  - Heat layer for macro targeting
  - Cluster layer for tactical canvassing
  - Household icons for direct contact logging
- Clicking household icon opens action panel:
  - canvassed? (yes/no)
  - contact outcome (not home / supporter / undecided / opposed / moved)
  - literature dropped, sign requested, volunteer interest
  - notes, next follow-up, assigned organizer

---

## Security & Data Isolation Requirements (Critical)

Because these are sensitive county voter files, treat this as **restricted PII infrastructure**.

### Environment separation
- Host this in a **separate project/account** from the public website.
- Use dedicated domain/subdomain (example: `fieldops-test.<campaign-domain>`), not linked publicly.
- Separate CI/CD pipeline and separate secrets store.

### Access control
- Enforce SSO + MFA for all users.
- Role-based access:
  - Admin: import/export + user management
  - Organizer: view/edit turf + canvass logs
  - Volunteer: narrow least-privilege access only if needed
- Session timeout + IP/device monitoring for admin actions.

### Data protection
- Encrypt data at rest and in transit.
- Encrypt backups, with separate key management.
- Store raw CSV in restricted bucket with short retention window.
- Prefer immutable audit logs for imports, exports, and record edits.

### Firewalling / network controls
- Restrict admin/API access with allowlists or VPN/identity-aware proxy.
- Disable all public indexing (robots + auth gate before content).
- WAF + rate limiting on auth and import endpoints.

### Compliance operations
- Data use policy and staff training before access is granted.
- Incident response runbook for lost device or suspected breach.
- Defined retention/deletion schedule after election cycle.

---

## Suggested Technical Architecture

### Frontend
- Map UI with Mapbox GL JS or Leaflet.
- Layers:
  - Heatmap
  - Clustered points
  - Household symbols
  - Manual staff annotations
- Side panel for filters (party, precinct, turnout score, canvass status).

### Backend API
- Endpoints:
  - `/imports/voters` (CSV ingest)
  - `/households` (normalized addresses)
  - `/map/features` (tile/geojson responses by viewport)
  - `/canvass/logs` (interaction writes)
  - `/annotations` (manual map pins)
- Job queue for geocoding + dedupe + enrichment.

### Storage
- PostgreSQL + PostGIS for geospatial querying.
- Optional Redis cache for map tile/API speed.
- Object storage for encrypted raw import files and generated reports.

### Geocoding strategy
- Batch geocode on import.
- Keep confidence score and geocode source.
- Route low-confidence addresses to review queue.
- Cache results to avoid repeated geocoding costs.

---

## Data Model (Minimum)

- `voters`
  - voter_id, names, party, source_county, source_file_id, household_id
- `households`
  - household_id, normalized_address, lat, lng, geocode_confidence
- `canvass_interactions`
  - interaction_id, household_id, voter_id (nullable), outcome, notes, next_followup_at, created_by
- `map_annotations`
  - annotation_id, lat, lng, type, note, created_by
- `imports`
  - import_id, county, uploaded_by, uploaded_at, status, accepted_rows, rejected_rows
- `audit_events`
  - actor, action, target_type, target_id, timestamp, metadata

---

## Rollout Plan

### Phase 0 (1–2 weeks): Secure foundation
- Stand up isolated environment + SSO + MFA + audit logging.
- Implement basic user roles.

### Phase 1 (2–3 weeks): CSV pipeline + map read
- CSV upload + schema mapping + validation report.
- Geocode + household clustering.
- Render heatmap and cluster layers.

### Phase 2 (2–3 weeks): Field logging workflow
- Click household icon to log outcomes and notes.
- Add organizer filters, assignment, and follow-up queue.
- Add manual annotation pins.

### Phase 3 (1–2 weeks): Hardening
- Pen test / security review.
- Backup restore drills.
- Data retention/deletion automation.

---

## Immediate Next Steps
1. Confirm exact CSV headers for Pierce and Thurston files.
2. Decide hosting stack for secure silo (cloud project + auth provider).
3. Build a small proof-of-concept with 500 redacted sample rows.
4. Validate geocoding quality and household clustering accuracy.
5. Run access-control tabletop test before loading full voter files.

---

## Notes on file transfer
Do **not** send county voter CSV files through personal email inboxes unless campaign counsel/operations has explicitly approved that workflow.

Safer alternatives:
- Secure upload portal with expiring links.
- Encrypted cloud bucket with limited-time access and audit trails.
- Password manager-delivered decryption key (separate channel from file transfer).

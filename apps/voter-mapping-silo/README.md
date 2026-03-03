# Voter Mapping Silo (Full Working Test Package)

Isolated, test-only field operations app for Pierce + Thurston voter-roll mapping.

## Features implemented
- PIN login gate (`/api/auth/login`).
- CSV import endpoint (`/api/imports/voters`) with county partition (`pierce|thurston`).
- Address normalization + household deduplication.
- Household map rendering with:
  - heat map density at low zoom,
  - cluster markers,
  - household-level click actions at high zoom.
- Click-to-log canvass outcomes (`/api/canvass/logs`).
- Map click annotation mode (`/api/annotations`).
- Dashboard counters + audit event stream.
- Combined live campaign feed (from `data/public-metrics.json` and `data/outreach_data.json`) inside the silo dashboard.
- Data quality panel (geocode confidence source split, import reject rate, interaction note coverage).
- JSON persistence in `apps/voter-mapping-silo/data/store.json`.

## Security controls included in this package
- Separate app path (`/app`) designed for silo deployment.
- Auth gate using environment PIN (must change default in real deployment).
- Audit log on imports, annotations, and canvass writes.
- No linkage to public campaign pages.

> Note: this is a secure **test package**, not a full compliance-certified production stack. For production, enforce SSO/MFA, private networking, managed KMS, encrypted backups, and legal/compliance controls.

## Run
```bash
npm install
SILO_ADMIN_PIN='replace-this' npm run silo:start
# open http://localhost:4177/app/
```

## CSV schema (minimum)
Required: an address field (`address`, `address1`, `street`, or `residence_address`)

Recommended columns:
- `voter_id`
- `first_name`
- `last_name`
- `address`
- `city`
- `state`
- `zip`
- `party`
- `precinct`
- optional `lat`, `lng`

## Test
```bash
npm run silo:test
```

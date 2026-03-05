# Ops Dashboard Runbook

## What changed from the old setup
The old setup only covered `npm install` + `npm run dev` and browser localStorage resets. This runbook now includes:
- Required runtime versions and baseline checks.
- Environment configuration (`.env`) needed for geocoding and build-time injectors.
- Optional local Nominatim setup for reliable geocoding in development.
- Validation commands before and after importing data.
- Recovery steps when geocoding or imports appear stalled.

## Local setup
1. Install dependencies:
   - `npm install`
2. Start the dashboard app:
   - `npm run dev`
3. Open the app URL printed by Vite (default: `http://localhost:5173`).
4. Use tabs: `imports`, `voters`, `map`, `phone`, `text`, `audit`.

## Prerequisites and quick checks
- Node.js 20+ recommended.
- npm available in PATH.

Run:
- `node -v`
- `npm -v`
- `npm run test`

## Environment
- Optional production DB env values are in `.env.example`.
- Current dashboard runtime store is browser localStorage key `afc_ops_db_v2`.

### Geocoding environment (recommended)
Set values in `.env` when using local geocoding:
- `GEOCODER_PROVIDER=nominatim_local` (or `mock`)
- `NOMINATIM_BASE_URL=http://localhost:8080`
- `GEOCODING_CONCURRENCY=6`
- `GEOCODING_RATE_LIMIT_PER_SEC=8`

If you do not run a local geocoder, use:
- `GEOCODER_PROVIDER=mock`

## Optional: run local Nominatim
For stable, non-public geocoding in local/dev:
1. `make nominatim-up`
2. `make nominatim-import`
3. `make nominatim-logs`

Reference files:
- `infra/nominatim/docker-compose.yml`
- `infra/nominatim/README.md`

## Import workflow
1. Go to **imports** tab.
2. Upload one or more CSV files.
3. Verify preview + adjust column mapping.
4. Click **Import all files**.
5. Confirm import history shows:
   - inserted / duplicates / invalid rows
   - pinned vs geocode queued
   - blocked / failed geocode counts

## Verification checks
- Voters tab row count increases after import.
- Map tab shows `Pins`, `Pending geocode`, and `Blocked`.
- Phone/text tabs show eligible voters (`phone != null` and `do_not_contact=false`).
- Audit tab contains clear/delete/import entries.

## Geocoding recovery
If records remain pending:
1. Open **map** tab.
2. Click **Run Geocoding Now**.
3. Re-check pending count.
4. Verify `city/state/zip/address` are present for blocked rows.

## Delete/clear operations
- Row delete: **voters** tab -> `Delete` on voter.
- Batch clear: **imports** tab -> `Clear batch` for one upload source.
- Clear all: top nav -> `Clear all`.
- All clear/delete actions are audit logged.

## Reset dataset
- Browser devtools console:
  - `localStorage.removeItem('afc_ops_db_v2')`
- Reload dashboard.

## Build/deploy sanity checks
Before release artifacts:
- `npm run build`
- `npm run verify:ga`
- `npm run qr:verify`

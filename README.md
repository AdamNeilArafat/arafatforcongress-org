# Vanguard Field Ops V3

Vanguard Field Ops V3 is a local-first campaign operations system for lawful field organizing.

## What changed in V3

- Added a dedicated Express + SQLite backend under `server/`.
- Added normalized V3 schema migrations for contacts, households, addresses, import jobs, geocoding cache, provider usage logs, routes, outreach events, suppression/consent flags, and audit logs.
- Added resumable CSV import pipeline (stage/process/pause/resume/cancel) with configurable dedupe strategy.
- Added provider-agnostic adapters for geocoding, demographics, legislative, finance, places (Overpass), GeoNames lookup, routing, and optional AI.
- Added geocoding workflow with Census-first and Nominatim fallback.
- Added route planning with openrouteservice adapter + nearest-neighbor fallback.
- Added admin V3 settings panel in the React UI.

## Provider policy

Google is optional and never required for core flows.

### Core/primary providers

1. U.S. Census Geocoder (primary geocoder for U.S. addresses)
2. Nominatim/OSM (low-volume fallback geocoder)
3. Census ACS API (demographics)
4. OpenStates API (legislative overlays)
5. FEC API (public finance overlays)
6. OpenStreetMap Overpass (optional nearby POI enrichment)
7. GeoNames (optional locality/postal helper)
8. Local validation + cache (email/phone quality and API cache)
9. openrouteservice adapter (optional routing API) + local nearest-neighbor fallback
10. AI adapters optional only (`NullAiProvider` by default)

## Folder layout

- `src/components`
- `src/pages`
- `src/lib`
- `src/hooks`
- `server/routes`
- `server/services`
- `server/providers`
- `server/jobs`
- `server/db`
- `server/db/migrations`
- `server/utils`

## Local MacBook runbook

1. Install deps:
   ```bash
   npm install
   ```
2. Configure env:
   ```bash
   cp .env.example .env
   ```
3. Start API:
   ```bash
   npm run server:dev
   ```
4. Start worker:
   ```bash
   npm run worker:dev
   ```
5. Start frontend:
   ```bash
   npm run dev
   ```

## API quickstart

- `GET /api/v3/health`
- `GET /api/v3/providers/health`
- `POST /api/v3/imports/jobs/stage`
- `POST /api/v3/imports/jobs/:jobId/process`
- `POST /api/v3/imports/jobs/:jobId/state`
- `POST /api/v3/geocode/lookup`
- `POST /api/v3/geocode/run`
- `POST /api/v3/routes/plan`
- `GET /api/v3/providers/places/nearby?latitude=...&longitude=...`
- `GET /api/v3/providers/legislative/people/search?...`
- `GET /api/v3/providers/finance/candidates/search?...`
- `GET /api/v3/providers/geonames/search?query=...`

## Optional vs required services

- **Required:** Node.js, SQLite (via `better-sqlite3`), Census Geocoder public endpoint (for full geocoding pipeline), local filesystem storage.
- **Optional:** OpenStates API key, FEC API key, Census ACS key, Overpass endpoint override, GeoNames username, openrouteservice key, Gemini key.
- **Not required:** Google APIs.

## Notes

- Public Nominatim is intentionally throttled and used as fallback only.
- API requests are cached in `api_cache` and logged in `provider_usage`.
- Background worker processes import and geocode jobs incrementally.

## Import pipeline (streaming + resumable)

- `POST /api/v3/imports/preview` inspects CSV headers/sample rows and returns auto-mapping suggestions.
- `POST /api/v3/imports/jobs/stage` stages rows to `import_rows` without loading entire file into memory.
- `POST /api/v3/imports/jobs/:jobId/process` processes chunked rows with cursor-based resume.
- `POST /api/v3/imports/jobs/:jobId/state` supports pause/resume/cancel controls.
- Supports dry-run preview (`dryRun: true`) for merge validation without writing contacts.

## Settings and observability

- `GET /api/v3/settings` and `POST /api/v3/settings` for provider/rate-limit/dedupe defaults.
- `GET /api/v3/settings/provider-usage` for provider request telemetry.
- `GET /api/v3/settings/failed-requests` for cached failed request inspection.

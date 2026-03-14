# Extensive QA Test Report

Date: 2026-03-14

## Scope
- Full automated suites (unit + smoke).
- Build pipeline dry run.
- Backend API health and functional dry runs.
- Enrichment/provider endpoints and API-key behavior checks.
- UI faux interaction pass to click visible buttons/controls across key pages.

## Automated checks
- `npm test`: pass (`13 passed`, `1 skipped` integration test).
- `npm run test:dashboard`: pass.
- `npm run silo:test`: pass.
- `npm run build`: pass (GA-related tasks skipped without GA key, expected).

## Backend/API dry-run checks
API server started with `npm run server:dev` and tested via `curl`.

### Passed
- `GET /api/v3/health` returned `{ ok: true }`.
- `GET /api/v3/providers/health` returned expected provider wiring.
- `POST /api/v3/imports/preview` with local filePath worked.
- `POST /api/v3/imports/jobs/stage` with `dryRun: true` created a job.
- `POST /api/v3/imports/jobs/:jobId/process` processed staged row.
- `POST /api/v3/routes/plan` produced route summary using fallback/local routing behavior.

### Provider/enrichment outcomes
- Environment has no optional provider keys set (`OPENSTATES_API_KEY`, `FEC_API_KEY`, `OPENROUTESERVICE_API_KEY`, `GEONAMES_USERNAME`, etc. all missing).
- Keyless providers (OpenStates/FEC/GeoNames) returned empty arrays as expected fallback behavior.
- Network-backed enrichment requests (Census tract / Overpass nearby / Census geocode) returned `TypeError: fetch failed` in this environment.

## UI faux functional run (button/function coverage)
Using Playwright against Vite dev server (`http://localhost:4178`):

- `/`: 3 buttons found, 2 clicked successfully.
- `/about.html`: 1 button found, 0 clicked (non-interactive/hidden at runtime).
- `/issues.html`: 1 button found, 0 clicked (non-interactive/hidden at runtime).
- `/events.html`: 5 buttons found, 4 clicked successfully.
- `/contact.html`: 5 buttons found, 4 clicked successfully.
- `/dashboard.html`: 15 buttons found, 12 clicked successfully.

### Frontend errors observed
- Dashboard API calls blocked by CORS when frontend is served from `localhost:4178` and backend from `localhost:4177` without permissive CORS headers for preflight requests.
- Browser console showed failed fetches for `/api/v3/providers/health` and `/api/v3/settings` due to CORS.

## Fix applied during QA
- Fixed provider base-method wiring bug in `server/providers/externalData.js`.
- Root cause: methods were attached via `Object.assign(this, new ProviderMixin(...))`, but class methods are on prototype and therefore not copied.
- Resolution: replaced class mixin copy pattern with explicit `attachProviderBase(...)` function that binds provider base methods directly onto each instance.

## Recommendations
1. Add CORS middleware configuration for dev UI + API split ports.
2. Add integration tests for `OverpassProvider` and `CensusAcsProvider` method presence (`this.request` availability).
3. Add optional mock mode for external providers to allow deterministic offline enrichment tests.

---

## Additional QA pass (requested: review info + test buttons/functions)

Date: 2026-03-14 (follow-up pass)

### What was validated
- Re-reviewed project docs and runbooks (`README.md`, `apps/voter-mapping-silo/README.md`) to verify intended app surfaces and available test scripts.
- Re-ran all repository-provided automated suites relevant to UI + ops flows.
- Performed browser-based interaction checks on key admin interfaces:
  - `admin/field-ops-v3.html` (including PIN-gated access)
  - `admin/volunteer-dashboard.html`

### Automated checks (follow-up)
- `npm test`: pass (`13 passed`, `1 skipped`).
- `npm run test:dashboard`: pass.
- `npm run test:field-ops-v3`: pass (`25 checks`).
- `npm run silo:test`: pass.

### Browser interaction checks (Playwright)
- `field-ops-v3`:
  - Successfully unlocked via default PIN (`1234`) in this environment.
  - Exercised visible controls: Settings open/close, tab changes (Voter List/Outreach), `Select All`, `Clear`, `Log outreach`.
- `volunteer-dashboard`:
  - Exercised top actions: `Refresh`, `Export CSV`, `Reload`.

### Functional notes
- `field-ops-v3` contains an authentication gate (`Admin PIN Required`) that blocks underlying controls until unlocked; this is expected behavior and not a defect.
- No new regressions were observed in the tested button/handler paths during this pass.

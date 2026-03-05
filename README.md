# District Ops Dashboard

## Local Nominatim geocoding (self-hosted)

Run a local geocoder (no dependency on public Nominatim):

```bash
make nominatim-up
make nominatim-import
make nominatim-logs
```

Deployment files:
- `infra/nominatim/docker-compose.yml`
- `infra/nominatim/README.md`

### Geocoding env vars

- `GEOCODER_PROVIDER=nominatim_local|mock` (default: `nominatim_local`)
- `NOMINATIM_BASE_URL=http://localhost:8080`
- `NOMINATIM_PBF_URL=https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf`
- `NOMINATIM_PORT=8080`
- `NOMINATIM_IMPORT_THREADS=4`
- `GEOCODING_CONCURRENCY=6`
- `GEOCODING_RATE_LIMIT_PER_SEC=8`
- `GEOCODING_MAX_ATTEMPTS=3`
- `GEOCODING_BACKOFF_SECONDS=30`

## Import + geocoding pipeline behavior

- CSV uploads append (multi-file supported) and create one import batch per file.
- Dedupe is global across all non-deleted voters by `external_voter_id`, else normalized `name+address+zip`.
- Rows with missing address parts (`city/state/zip/address`) are marked `blocked_missing_fields` and are not queued.
- Geocode jobs are queued per voter and processed by background worker (`src/jobs/runGeocodeWorker.ts`).
- Successful geocodes are cached in `geocode_cache` by normalized-address hash.
- Map/Calls/Texts read from the same voter DB store.
- Clear All, Clear Import, and Delete Row are soft-delete operations with audit log entries.

## Conversations feed configuration

`js/conversations-feed.js` now resolves the feed endpoint in this order:

1. `<meta name="conversations-feed-url" content="...">` in the page `<head>`
2. `window.AFC_CONFIG.conversationsFeedUrl`
3. `window.CONVERSATIONS_FEED_URL`
4. Legacy fallback: `https://arafatforcongress.github.io/WebCrawler/conversations.json`

This means existing pages keep working even if no custom feed is provided.

If you are generating pages from environment variables, set `CONVERSATIONS_FEED_URL` (see `.env.example`) and inject it into either the meta tag or one of the supported `window` config objects before `js/conversations-feed.js` runs.

### Deployment cleanup (remove prototype/test pages)

Before deploying, remove prototype/test artifacts from the publish output, including:

- `ga-test/` (contains GA test markup with `G-PLACEHOLDER`)
- field-ops test/prototype pages and scripts (for example `admin/field-ops-test.html` and `js/field-ops-test.js`)

Keep deployment artifacts limited to production pages only.

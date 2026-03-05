# District Ops Dashboard

## Geocoding environment variables

Set these for import + background geocoding:

- `GEOCODER_PROVIDER=mock|mapbox` (default: `mock`)
- `GEOCODING_API_KEY=...` (required when `GEOCODER_PROVIDER=mapbox`)
- `GEOCODING_RATE_LIMIT_PER_SEC=5`
- `GEOCODING_MAX_ATTEMPTS=3`
- `GEOCODING_BACKOFF_SECONDS=30`

## Running geocoding

- Upload CSVs from the admin imports panel. Imports append and dedupe in the local DB store.
- Use **Run Geocoding Now** in the map tab to process queued address geocode jobs in batches.

## Notes

- Mock provider is deterministic and intended for tests/local development.
- Voters, outreach, and geocode jobs are soft-deleted by Clear All / Clear Batch controls.

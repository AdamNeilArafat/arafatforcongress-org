# Local Nominatim deployment

This stack runs a self-hosted Nominatim instance backed by persistent Docker volumes.

## Environment variables

- `NOMINATIM_PBF_URL` (required in practice): OSM extract URL to import. Example: `https://download.geofabrik.de/north-america/us/washington-latest.osm.pbf`
- `NOMINATIM_PORT` (default `8080`)
- `NOMINATIM_BASE_URL` (app-side, default `http://localhost:8080`)
- `NOMINATIM_IMPORT_THREADS` (optional, default `4`)
- `NOMINATIM_POSTGRES_TUNING_NOTES` (doc-only): capture host tuning notes such as shared_buffers/work_mem for large imports

## Commands

From repo root:

```bash
make nominatim-up
make nominatim-import
make nominatim-logs
curl -fsS http://localhost:${NOMINATIM_PORT:-8080}/status
```

Stop:

```bash
make nominatim-down
```

## Notes

- By default the service is bound to `127.0.0.1` only.
- First import can take a long time depending on the PBF size.
- Data is persisted in `nominatim-data` and `nominatim-flatnode` volumes.

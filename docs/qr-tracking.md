# QR Tracking & GA4 Guide

This site uses GA4 plus static redirect pages to track every QR code scan as its own event.

## GA4 setup

1. Store your GA4 measurement ID in the environment variable `GA_MEASUREMENT_ID`.
2. Run `npm run ga:inject` before deploying. The command fails if the variable is missing or looks like a placeholder.
3. The global loader (`js/ga-loader.js`) reads the injected `<meta name="ga-measurement-id">` value on every page and loads GA4 via gtag.js.

## Adding a QR code

1. Add one row to `data/qr_map.csv` with columns:
   - `qr_id`: lowercase, numbers, and hyphens only (e.g., `wa10-townhall-001`).
   - `path`: must be `/go/<qr_id>`.
   - `destination_url`: full URL to redirect to.
   - `dest_label` (optional): short label like `donate`, `volunteer`, `events`.
   - `notes` (optional): any maintainer notes.
2. Run the generator: `npm run qr:build` (requires `GA_MEASUREMENT_ID`).
3. Verify outputs: `npm run qr:verify`.
4. Commit the CSV changes. Generated artifacts are produced during CI before deployment.

## What the generator creates

From `data/qr_map.csv` it produces:
- Redirect pages at `/go/<qr_id>/index.html` that fire GA4 event `qr_redirect` with parameters `qr_id`, `dest_label`, and `destination_url`, wait 250 ms, and then redirect.
- QR PNGs at `artifacts/qr/<qr_id>.png` (high error correction, print friendly).
- `artifacts/qr/manifest.json` containing all entries and metadata.

## Viewing results in GA4

1. In GA4 Admin, register a custom dimension for `qr_id` (event scope). Repeat for `dest_label` if desired.
2. Use Realtime to confirm scans: open `/go/<qr_id>` and look for the `qr_redirect` event.
3. In Explore → Free form: set `qr_id` as Rows, filter by event name `qr_redirect`, and use Event count as Values.

## Printing notes

- Use the generated PNGs; they are designed for high error correction (H level) and 1024px width for crisp printing.
- Keep a quiet zone (margin) around the QR when placing on materials.
- Maintain high contrast (dark code on light background) for reliable scanning.

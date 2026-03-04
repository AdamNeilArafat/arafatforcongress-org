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


## Website-accessible deployment pattern (piggyback + separation)
Use the campaign domain as a launch surface while keeping the silo isolated:

1. Keep the silo process running separately (`npm run silo:start`) with its own environment secrets.
2. Publish it behind a reverse proxy path such as `https://arafatforcongress.org/silo/` -> `http://127.0.0.1:4177/`.
3. Use `/admin/silo-dashboard.html` as the website launchpad and URL switchboard.
4. Continue using `/admin/volunteer-dashboard.html` as the original operational dashboard.

Minimal nginx example:

```nginx
location /silo/ {
  proxy_pass http://127.0.0.1:4177/;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```



## Quick internet link (Cloudflare Tunnel)
If you need a temporary public URL that works from anywhere:

```bash
# terminal 1
SILO_ADMIN_PIN='replace-this' npm run silo:start

# terminal 2 (cloudflared installed on host)
cloudflared tunnel --url http://localhost:4177
```

Use the generated `https://<random>.trycloudflare.com/app/` as the silo URL in `/admin/silo-dashboard.html`.

Health check URL pattern:

```
https://<random>.trycloudflare.com/api/health
```

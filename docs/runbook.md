# Ops Dashboard Runbook

## Local setup
1. Install dependencies (if your environment allows npm registry access):
   - `npm install`
2. Start app:
   - `npm run dev`
3. Open dashboard and use tabs: imports, voters, map, phone, text, audit.

## Environment
- Optional Supabase env values are in `.env.example` for production DB integration.
- Current dev dashboard persists canonical ops data in browser localStorage key `afc_ops_db_v2`.

## Import workflow
1. Go to **imports** tab.
2. Upload one or more CSV files.
3. Verify preview + adjust column mapping.
4. Click **Import all files**.
5. Confirm import history shows inserted/duplicate/invalid counts and pinned/pending geocode counts.

## Verification checks
- Voters tab row count should increase after import.
- Map tab should show `X pinned, Y pending geocode`.
- Phone/text tabs should show eligible voters (`phone != null`, `do_not_contact=false`).

## Delete/clear operations
- Row delete: Voters tab -> `Delete` on a voter.
- Batch clear: Imports tab -> `Clear batch` for one upload source.
- Clear all: top nav -> `Clear all`.
- All clear/delete actions are audit logged.

## Reset dataset
- Browser devtools console:
  - `localStorage.removeItem('afc_ops_db_v2')`
- Reload dashboard.

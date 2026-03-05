# District 10 Ops Dashboard Integration Plan

## Repo audit summary
- Host repo is primarily a static campaign site with HTML pages and lightweight Node scripts.
- Existing operationally relevant module: `apps/voter-mapping-silo` (Node + static frontend) with map/data concepts reusable for field ops.
- No existing React + TypeScript application shell, Supabase schema, or role-based auth layer in the host root.

## Source repo integration status
A dedicated external Source repo path/URL was not present in the workspace, so this implementation uses in-repo modules as the initial source baseline.

## Copy vs rewrite decisions
- **Copy/reuse**: field-map concepts from `apps/voter-mapping-silo` at architecture level (household markers, map-first operations).
- **Rewrite**: app shell, CSV parser/validator, data schema, role checks, and dashboard pages in React + TypeScript under `src/`.
- **Glue/adapters**: routing/pages, schema mapping, and script merge utility.

## Dependency and route considerations
- Added Vite + React + TypeScript as a separate dashboard entry (`dashboard.html`) to avoid collision with existing static site pages.
- Kept original scripts (`ga:inject`, `signup:inject`, etc.) intact.

## Imported/placed file map
- New dashboard app root: `src/main.tsx`
- Admin pages: `src/pages/admin/*`
- Volunteer pages: `src/pages/volunteer/*`
- CSV pipeline: `src/lib/csv/*`
- Script merge utility: `src/lib/scripts/merge.ts`
- Geocode job placeholder: `src/jobs/geocodeHouseholds.ts`
- DB schema + RLS seed policies: `supabase/migrations/202603050001_district10_ops.sql`

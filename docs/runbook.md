# District 10 Ops Dashboard Runbook (Happy Path)

1. **Create admin user**
   - Create Supabase auth user.
   - Insert role row in `user_roles` with `role='admin'`.

2. **Upload CSV**
   - Open dashboard upload page (`AdminUploadPage`).
   - Select voter CSV and watch row progress.
   - Resolve any line-level validation errors.

3. **Geocode**
   - Run geocode batch job for households missing lat/lng.
   - Verify geocode status page for completion and retry count.

4. **Create turf**
   - Open admin turfs page and define turf boundaries.
   - Set turf status to `active`.

5. **Assign volunteer**
   - Create assignment linking turf to volunteer user.
   - Confirm volunteer sees only assigned list/map.

6. **Volunteer logs calls/texts**
   - Volunteer opens call/text pages.
   - Logs each result to `contact_attempts`.

7. **Admin sees progress**
   - Review dashboard tiles for completion and outcomes.
   - Export contact attempts/turf lists for reporting.

## Local dev
- Install: `npm install`
- Run dashboard app: `npm run dev` then open `/dashboard.html`
- Run tests: `npm test`

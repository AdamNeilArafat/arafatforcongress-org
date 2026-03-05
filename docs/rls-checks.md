# RLS Validation Queries

Use these sample checks in Supabase SQL editor (with role simulation where available):

```sql
-- Admin should read all voters
select * from public.voters limit 10;

-- Volunteer should only read assigned voters
select v.*
from public.voters v
where exists (
  select 1
  from public.assignments a
  join public.voter_household_link l on l.voter_id = v.id
  where a.assigned_to = auth.uid()
);
```

Expected: volunteer cannot query unassigned voter rows directly.

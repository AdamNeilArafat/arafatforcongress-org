# District 10 Ops Data Model

Implemented in `supabase/migrations/202603050001_district10_ops.sql`.

## Core tables
- `voters_raw_imports`: ingestion audit and processing status.
- `voters`: normalized person/voter records.
- `households`: deduped address-level entity with geocode cache fields.
- `voter_household_link`: voter-to-household bridge.
- `turfs`: canvass zones for walk/drive/phone/text.
- `assignments`: user assignment records per turf.
- `contact_attempts`: immutable interaction log.
- `scripts`: reusable script templates by channel.
- `message_queue`: optional outbound text queue.
- `user_roles`: role mapping for RLS decisions.

## RLS approach
- `current_role()` helper resolves role from `user_roles` using `auth.uid()`.
- Baseline policies included for voter access (admin full, manager read, volunteer scoped reads).
- Expand with table-specific policies in deployment before production rollout.

## Notes
- Additional indexes and policy hardening are recommended after real workload profiling.

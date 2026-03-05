-- Geocoding + resumable import pipeline schema

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  source_file_name text not null,
  uploaded_at timestamptz not null default now(),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  pinnable_count integer not null default 0,
  geocode_queued_count integer not null default 0,
  geocode_success_count integer not null default 0,
  geocode_failed_count integer not null default 0,
  status text not null default 'processing',
  error_summary text
);

alter table public.voters
  add column if not exists import_id uuid references public.imports(id),
  add column if not exists address_line1 text,
  add column if not exists full_address text,
  add column if not exists geocode_status text default 'pending',
  add column if not exists geocode_provider text,
  add column if not exists geocode_confidence numeric,
  add column if not exists geocode_error text,
  add column if not exists geocode_attempts integer not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.geocode_jobs (
  id uuid primary key default gen_random_uuid(),
  voter_id uuid not null references public.voters(id),
  full_address text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists geocode_jobs_status_next_run_idx on public.geocode_jobs(status, next_run_at);
create index if not exists voters_import_id_idx on public.voters(import_id);

create extension if not exists "uuid-ossp";

create table if not exists public.imports (
  id uuid primary key default uuid_generate_v4(),
  source_file_name text not null,
  uploaded_at timestamptz not null default now(),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  pinned_count integer not null default 0,
  status text not null check (status in ('processing','complete','failed')),
  error_summary text
);

create table if not exists public.voters (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid references public.imports(id) on delete set null,
  external_voter_id text,
  first_name text,
  middle_name text,
  last_name text,
  birth_year integer,
  gender text,
  address text,
  city text,
  state text,
  zip text,
  precinct text,
  legislative_district text,
  congressional_district text,
  latitude double precision,
  longitude double precision,
  geocode_status text,
  geocode_error text,
  phone text,
  email text,
  do_not_contact boolean not null default false,
  tags jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists voters_external_voter_id_active_uniq on public.voters(external_voter_id) where deleted_at is null and external_voter_id is not null;
create index if not exists voters_last_name_idx on public.voters(last_name);
create index if not exists voters_precinct_idx on public.voters(precinct);
create index if not exists voters_congressional_district_idx on public.voters(congressional_district);
create index if not exists voters_phone_idx on public.voters(phone);
create index if not exists voters_lat_lng_idx on public.voters(latitude, longitude);

create table if not exists public.outreach_logs (
  id uuid primary key default uuid_generate_v4(),
  voter_id uuid not null references public.voters(id) on delete cascade,
  channel text not null check (channel in ('door','phone','text')),
  outcome text not null,
  notes text,
  timestamp timestamptz not null default now(),
  metadata_json jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists outreach_logs_voter_timestamp_idx on public.outreach_logs(voter_id, timestamp);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  entity text not null,
  entity_id uuid,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists imports_uploaded_at_idx on public.imports(uploaded_at);

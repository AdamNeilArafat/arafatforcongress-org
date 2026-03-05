create extension if not exists "uuid-ossp";

create table if not exists public.imports (
  id uuid primary key default uuid_generate_v4(),
  source_name text not null,
  source_type text not null check (source_type in ('file','sheet')),
  uploaded_at timestamptz not null default now(),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  pinnable_count integer not null default 0,
  callable_count integer not null default 0,
  textable_count integer not null default 0,
  status text not null check (status in ('processing','complete','failed')),
  error_summary text
);

create table if not exists public.voters (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid references public.imports(id) on delete set null,
  state_voter_id text,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  birth_year integer,
  gender text,
  address_line1 text,
  city text,
  state text,
  zip text,
  full_address text,
  latitude double precision,
  longitude double precision,
  geocode_status text not null default 'pending' check (geocode_status in ('pending','success','failed','blocked_missing_city_zip','blocked_missing_fields')),
  geocode_error text,
  phone text,
  email text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists voters_last_name_idx on public.voters(last_name);
create index if not exists voters_state_voter_id_idx on public.voters(state_voter_id);
create index if not exists voters_lat_lng_idx on public.voters(latitude, longitude);
create index if not exists voters_phone_idx on public.voters(phone);
create index if not exists voters_zip_idx on public.voters(zip);

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

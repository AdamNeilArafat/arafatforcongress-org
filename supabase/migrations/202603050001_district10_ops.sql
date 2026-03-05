create extension if not exists "uuid-ossp";

create table if not exists public.user_roles (
  user_id uuid primary key,
  role text not null check (role in ('admin','manager','volunteer')),
  created_at timestamptz not null default now()
);

create table if not exists public.voters_raw_imports (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  uploaded_by uuid not null,
  original_filename text not null,
  source_tag text,
  row_count integer default 0,
  status text not null check (status in ('queued','processing','complete','failed')),
  error_summary text
);

create table if not exists public.voters (
  id uuid primary key default uuid_generate_v4(),
  state_voter_id text unique,
  first_name text,
  middle_name text,
  last_name text,
  suffix text,
  birth_year integer,
  gender text,
  phone text,
  email text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  zip text,
  full_address text,
  latitude double precision,
  longitude double precision,
  precinct_code text,
  legislative_district text,
  congressional_district text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default uuid_generate_v4(),
  full_address text unique not null,
  latitude double precision,
  longitude double precision,
  city text,
  zip text,
  created_at timestamptz not null default now()
);

create table if not exists public.voter_household_link (
  voter_id uuid references public.voters(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  primary key (voter_id, household_id)
);

create table if not exists public.turfs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null check (type in ('walk','drive','phone','text')),
  polygon_geojson jsonb,
  bounds jsonb,
  created_by uuid not null,
  status text not null check (status in ('draft','active','archived')) default 'draft'
);

create table if not exists public.assignments (
  id uuid primary key default uuid_generate_v4(),
  turf_id uuid not null references public.turfs(id) on delete cascade,
  assigned_to uuid not null,
  assigned_by uuid not null,
  status text not null check (status in ('assigned','in_progress','completed','released')) default 'assigned',
  due_date date
);

create table if not exists public.contact_attempts (
  id uuid primary key default uuid_generate_v4(),
  voter_id uuid references public.voters(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  channel text not null check (channel in ('door','phone','text','mail','flyer')),
  result_code text not null,
  notes text,
  script_version text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.scripts (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('phone','text','door')),
  name text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.message_queue (
  id uuid primary key default uuid_generate_v4(),
  voter_id uuid references public.voters(id) on delete set null,
  channel text not null check (channel in ('text')),
  to_number text not null,
  body text not null,
  status text not null check (status in ('queued','sent','failed')) default 'queued',
  provider_message_id text,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
alter table public.voters_raw_imports enable row level security;
alter table public.voters enable row level security;
alter table public.households enable row level security;
alter table public.voter_household_link enable row level security;
alter table public.turfs enable row level security;
alter table public.assignments enable row level security;
alter table public.contact_attempts enable row level security;
alter table public.scripts enable row level security;
alter table public.message_queue enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create policy "admin full access" on public.voters for all using (public.current_role() = 'admin') with check (public.current_role() = 'admin');
create policy "manager read voters" on public.voters for select using (public.current_role() in ('admin','manager'));
create policy "volunteer assigned voters" on public.voters for select using (
  exists (
    select 1
    from public.assignments a
    join public.voter_household_link vhl on true
    where a.assigned_to = auth.uid()
      and vhl.voter_id = voters.id
  )
);

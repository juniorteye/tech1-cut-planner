-- Workshop Cut Planner: initial schema.
-- Every record belongs to a workshop, and row level security keeps each
-- workshop's data visible only to its own members.

create schema if not exists private;

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kerf_mm numeric(10, 4) not null default 3 check (kerf_mm >= 0),
  display_unit text not null default 'mm' check (display_unit in ('mm', 'ft-in')),
  created_at timestamptz not null default now()
);

create table public.workshop_members (
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'worker')),
  created_at timestamptz not null default now(),
  primary key (workshop_id, user_id)
);

create index workshop_members_user_id_idx on public.workshop_members (user_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  kind text not null check (kind in ('board', 'timber')),
  name text not null check (length(trim(name)) > 0),
  board_type text check (board_type in ('plywood', 'mdf', 'chipboard', 'melamine')),
  length_mm numeric(10, 4) check (length_mm > 0),
  width_mm numeric(10, 4) check (width_mm > 0),
  thickness_mm numeric(10, 4) check (thickness_mm > 0),
  price_per_sheet bigint check (price_per_sheet >= 0),
  edge_trim_mm numeric(10, 4) not null default 0 check (edge_trim_mm >= 0),
  min_leftover_short_side_mm numeric(10, 4) not null default 100 check (min_leftover_short_side_mm >= 0),
  min_leftover_area_mm2 numeric(14, 2) not null default 90000 check (min_leftover_area_mm2 >= 0),
  min_leftover_length_mm numeric(10, 4) not null default 300 check (min_leftover_length_mm >= 0),
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  constraint board_fields_required check (
    kind <> 'board' or (
      board_type is not null
      and length_mm is not null
      and width_mm is not null
      and thickness_mm is not null
      and price_per_sheet is not null
    )
  )
);

create table public.timber_lengths (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  material_id uuid not null,
  length_mm numeric(10, 4) not null check (length_mm > 0),
  price_per_piece bigint not null check (price_per_piece >= 0),
  unique (material_id, length_mm),
  foreign key (workshop_id, material_id)
    references public.materials (workshop_id, id) on delete cascade
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  customer text not null default '',
  status text not null default 'draft' check (status in ('draft', 'accepted', 'cut', 'cancelled')),
  quote_mode text not null default 'whole-sheets' check (quote_mode in ('whole-sheets', 'part-used')),
  waste_allowance_percent numeric(5, 2) not null default 0 check (waste_allowance_percent >= 0),
  copied_from_job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workshop_id, id)
);

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  job_id uuid not null,
  material_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  length_mm numeric(10, 4) not null check (length_mm > 0),
  width_mm numeric(10, 4) check (width_mm > 0),
  quantity integer not null default 1 check (quantity > 0),
  grain_locked boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (workshop_id, job_id) references public.jobs (workshop_id, id) on delete cascade,
  foreign key (workshop_id, material_id) references public.materials (workshop_id, id)
);

create index pieces_job_id_idx on public.pieces (job_id);

create table public.leftovers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  material_id uuid not null,
  length_mm numeric(10, 4) not null check (length_mm > 0),
  width_mm numeric(10, 4) check (width_mm > 0),
  status text not null default 'available' check (status in ('available', 'reserved', 'used', 'damaged')),
  value bigint not null default 0 check (value >= 0),
  source_job_id uuid,
  used_by_job_id uuid,
  created_at timestamptz not null default now(),
  foreign key (workshop_id, material_id) references public.materials (workshop_id, id) on delete cascade,
  foreign key (workshop_id, source_job_id) references public.jobs (workshop_id, id),
  foreign key (workshop_id, used_by_job_id) references public.jobs (workshop_id, id)
);

create index leftovers_available_idx on public.leftovers (workshop_id, material_id) where status = 'available';

-- Runs with raised rights so the membership check is not itself blocked by
-- row level security on workshop_members.
create function private.is_workshop_member(target_workshop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workshop_members m
    where m.workshop_id = target_workshop_id
      and m.user_id = auth.uid()
  );
$$;

-- A new workshop has no members yet, so nobody could pass its row checks.
-- This creates the workshop and makes the caller its owner in one step.
create function public.create_workshop(workshop_name text)
returns public.workshops
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.workshops;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in to create a workshop';
  end if;

  insert into public.workshops (name) values (workshop_name) returning * into created;
  insert into public.workshop_members (workshop_id, user_id) values (created.id, auth.uid());
  return created;
end;
$$;

alter table public.workshops enable row level security;
alter table public.workshop_members enable row level security;
alter table public.materials enable row level security;
alter table public.timber_lengths enable row level security;
alter table public.jobs enable row level security;
alter table public.pieces enable row level security;
alter table public.leftovers enable row level security;

create policy "Members can read their workshop" on public.workshops
  for select to authenticated
  using (private.is_workshop_member(id));

create policy "Members can update their workshop" on public.workshops
  for update to authenticated
  using (private.is_workshop_member(id))
  with check (private.is_workshop_member(id));

create policy "Members can see their workshop's members" on public.workshop_members
  for select to authenticated
  using (private.is_workshop_member(workshop_id));

create policy "Members manage materials" on public.materials
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

create policy "Members manage timber lengths" on public.timber_lengths
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

create policy "Members manage jobs" on public.jobs
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

create policy "Members manage pieces" on public.pieces
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

create policy "Members manage leftovers" on public.leftovers
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

-- New tables are not exposed automatically on this project, so access is
-- granted here. Logged-out visitors get nothing.
grant usage on schema private to authenticated;
grant execute on function private.is_workshop_member(uuid) to authenticated;

revoke execute on function public.create_workshop(text) from public, anon;
grant execute on function public.create_workshop(text) to authenticated;

grant usage on schema public to authenticated, service_role;
grant select, update on public.workshops to authenticated;
grant select on public.workshop_members to authenticated;
grant select, insert, update, delete on
  public.materials,
  public.timber_lengths,
  public.jobs,
  public.pieces,
  public.leftovers
to authenticated;

grant select, insert, update, delete on
  public.workshops,
  public.workshop_members,
  public.materials,
  public.timber_lengths,
  public.jobs,
  public.pieces,
  public.leftovers
to service_role;

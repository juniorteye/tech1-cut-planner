-- A job's parts are listed under headings, one per board (Miniyator,
-- B-Panels, D-Grey). Each section has a name and the board its parts use
-- unless a part says otherwise. A job can also be made several times over
-- ("5 set Kitchens"), which multiplies every part.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null,
  job_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  material_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workshop_id, id),
  foreign key (workshop_id, job_id) references public.jobs (workshop_id, id) on delete cascade,
  foreign key (workshop_id, material_id) references public.materials (workshop_id, id)
);

create index sections_job_id_idx on public.sections (job_id);

-- Left nullable so the version of the app running before this one can still
-- add parts; the app shows a part with no section under "Other parts".
alter table public.pieces add column section_id uuid;
alter table public.pieces
  add constraint pieces_section_fk foreign key (workshop_id, section_id)
  references public.sections (workshop_id, id) on delete cascade;
create index pieces_section_id_idx on public.pieces (section_id);

alter table public.jobs add column sets integer not null default 1 check (sets between 1 and 999);

alter table public.sections enable row level security;

create policy "Members manage sections" on public.sections
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

revoke all on public.sections from anon;
grant select, insert, update, delete on public.sections to authenticated;
grant select, insert, update, delete on public.sections to service_role;

-- Existing jobs: one section per board their parts use, named after the board.
insert into public.sections (workshop_id, job_id, name, material_id, position)
select p.workshop_id, p.job_id, m.name, p.material_id,
  (row_number() over (partition by p.job_id order by min(p.created_at)) - 1)::integer
from public.pieces p
join public.materials m on m.id = p.material_id
group by p.workshop_id, p.job_id, p.material_id, m.name;

update public.pieces p
set section_id = s.id
from public.sections s
where s.job_id = p.job_id and s.material_id = p.material_id and p.section_id is null;

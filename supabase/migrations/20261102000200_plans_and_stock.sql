-- Saved plans, and the stock moves that must happen all together or not at all.

create table public.plans (
  job_id uuid primary key,
  workshop_id uuid not null,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (workshop_id, job_id) references public.jobs (workshop_id, id) on delete cascade
);

alter table public.plans enable row level security;

create policy "Members manage plans" on public.plans
  for all to authenticated
  using (private.is_workshop_member(workshop_id))
  with check (private.is_workshop_member(workshop_id));

revoke all on public.plans from anon;
grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plans to service_role;

-- Accepting reserves leftovers, so two accepted jobs can never count on the same offcut.
create function public.accept_job(target_job uuid, job_plan jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  job record;
  wanted uuid[];
  reserved integer;
begin
  select id, workshop_id, status into job from public.jobs where id = target_job for update;
  if not found then
    raise exception 'job_not_found';
  end if;
  if job.status <> 'draft' then
    raise exception 'job_not_draft';
  end if;

  select coalesce(array_agg(value::uuid), '{}') into wanted
  from jsonb_array_elements_text(job_plan -> 'leftoverIds');

  update public.leftovers
  set status = 'reserved', used_by_job_id = target_job
  where id = any (wanted) and status = 'available';

  get diagnostics reserved = row_count;
  if reserved <> cardinality(wanted) then
    raise exception 'leftover_taken';
  end if;

  insert into public.plans (job_id, workshop_id, plan)
  values (target_job, job.workshop_id, job_plan)
  on conflict (job_id) do update set plan = excluded.plan, created_at = now();

  update public.jobs set status = 'accepted' where id = target_job;
end;
$$;

-- Goes back to draft and frees whatever the accepted plan had reserved.
create function public.reopen_job(target_job uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
begin
  select status into current_status from public.jobs where id = target_job for update;
  if current_status is distinct from 'accepted' then
    raise exception 'job_not_accepted';
  end if;

  update public.leftovers
  set status = 'available', used_by_job_id = null
  where used_by_job_id = target_job and status = 'reserved';

  delete from public.plans where job_id = target_job;
  update public.jobs set status = 'draft' where id = target_job;
end;
$$;

-- The only point where stock really changes: leftovers are used up, new offcuts are stored.
create function public.mark_job_cut(target_job uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  job record;
  saved jsonb;
begin
  select id, workshop_id, status into job from public.jobs where id = target_job for update;
  if not found or job.status <> 'accepted' then
    raise exception 'job_not_accepted';
  end if;

  select plan into saved from public.plans where job_id = target_job;

  update public.leftovers
  set status = 'used'
  where used_by_job_id = target_job and status = 'reserved';

  insert into public.leftovers (workshop_id, material_id, length_mm, width_mm, value, source_job_id)
  select job.workshop_id, o."materialId", o."lengthMm", o."widthMm", o.value, target_job
  from jsonb_to_recordset(saved -> 'offcuts')
    as o("materialId" uuid, "lengthMm" numeric, "widthMm" numeric, value bigint);

  update public.jobs set status = 'cut' where id = target_job;
end;
$$;

-- Undo gives back what the job used and removes what it created, unless a
-- created offcut has already gone into something else.
create function public.undo_job_cut(target_job uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_status text;
  blocking_job text;
begin
  select status into current_status from public.jobs where id = target_job for update;
  if current_status is distinct from 'cut' then
    raise exception 'job_not_cut';
  end if;

  if exists (
    select 1 from public.leftovers
    where source_job_id = target_job and status in ('reserved', 'used')
  ) then
    select coalesce(max(j.name), 'something else') into blocking_job
    from public.leftovers l
    left join public.jobs j on j.id = l.used_by_job_id
    where l.source_job_id = target_job and l.status in ('reserved', 'used');
    raise exception 'offcut_in_use:%', blocking_job;
  end if;

  delete from public.leftovers where source_job_id = target_job;

  update public.leftovers
  set status = 'reserved'
  where used_by_job_id = target_job and status = 'used';

  update public.jobs set status = 'accepted' where id = target_job;
end;
$$;

revoke execute on function public.accept_job(uuid, jsonb) from public, anon;
revoke execute on function public.reopen_job(uuid) from public, anon;
revoke execute on function public.mark_job_cut(uuid) from public, anon;
revoke execute on function public.undo_job_cut(uuid) from public, anon;

grant execute on function public.accept_job(uuid, jsonb) to authenticated;
grant execute on function public.reopen_job(uuid) to authenticated;
grant execute on function public.mark_job_cut(uuid) to authenticated;
grant execute on function public.undo_job_cut(uuid) to authenticated;

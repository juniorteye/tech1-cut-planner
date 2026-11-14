-- A short note on a part, for marks the planner cannot read yet
-- ("thick tape on front"). Shown on the part, the plan and the cut sheet.
alter table public.pieces
  add column note text not null default '' check (length(note) <= 200);

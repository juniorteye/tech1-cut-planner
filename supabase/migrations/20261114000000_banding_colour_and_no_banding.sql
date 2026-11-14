-- Edge tape is bought by colour, so boards that share a colour share one
-- banding total (D-Grey 8×4 and D-Grey 9×7 both use D-Grey tape).
-- Back panels and other thin boards take no banding at all.

alter table public.materials
  add column banding_colour text check (banding_colour is null or length(trim(banding_colour)) > 0),
  add column no_banding boolean not null default false;

update public.materials set banding_colour = name where kind = 'board';

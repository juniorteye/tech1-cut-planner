-- Edge banding per piece, and centimetres as a display unit.
-- Banding is counted per side as the piece was entered: how many of its two
-- length edges and two width edges get banding. Timber pieces always stay at 0.

alter table public.pieces
  add column banded_lengths smallint not null default 0 check (banded_lengths between 0 and 2),
  add column banded_widths smallint not null default 0 check (banded_widths between 0 and 2);

alter table public.workshops drop constraint workshops_display_unit_check;
alter table public.workshops
  add constraint workshops_display_unit_check check (display_unit in ('mm', 'cm', 'ft-in'));

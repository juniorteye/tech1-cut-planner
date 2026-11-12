import { describeEdges, type BandedEdges } from "@/lib/planner/banding";

/**
 * The sketch's small rectangle: long sides left and right, short sides top and
 * bottom, banded edges drawn dark. The size is set on the SVG itself, not only
 * by a class: an SVG with no size fills its whole container, so a missing or
 * out-of-date stylesheet would otherwise blow it up across the row.
 */
export function EdgeIcon({ bandedLengths, bandedWidths }: BandedEdges) {
  const edge = (on: boolean) => (on ? "var(--color-ink)" : "var(--color-line)");

  return (
    <svg
      viewBox="0 0 16 22"
      width={40}
      height={55}
      className="block h-[55px] w-10 shrink-0"
      role="img"
      aria-label={`Banding: ${describeEdges({ bandedLengths, bandedWidths })}`}
    >
      <rect x="2" y="2" width="12" height="18" fill="var(--color-timber)" />
      <line x1="2" y1="1" x2="2" y2="21" stroke={edge(bandedLengths >= 1)} strokeWidth="2.5" />
      <line x1="14" y1="1" x2="14" y2="21" stroke={edge(bandedLengths >= 2)} strokeWidth="2.5" />
      <line x1="1" y1="2" x2="15" y2="2" stroke={edge(bandedWidths >= 1)} strokeWidth="2.5" />
      <line x1="1" y1="20" x2="15" y2="20" stroke={edge(bandedWidths >= 2)} strokeWidth="2.5" />
    </svg>
  );
}

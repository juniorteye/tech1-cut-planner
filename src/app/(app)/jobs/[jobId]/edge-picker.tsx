"use client";

import { pieceBandingMm } from "@/lib/planner/banding";
import type { Mm } from "@/lib/types";

export type Edges = { left: boolean; right: boolean; top: boolean; bottom: boolean };

export const NO_EDGES: Edges = { left: false, right: false, top: false, bottom: false };

const BOX = 120;
// Also the tap height of the side edges, so it never drops under 40 px.
const MIN_SIDE = 44;

/**
 * Drawn the way the workshop sketches a part: always tall, so the longer side
 * runs up the left and right, whichever size was typed first. A mark on the
 * left bands a long side; a mark on the top or bottom bands a short side.
 */
function boxSize(lengthMm: Mm | null, widthMm: Mm | null) {
  if (!lengthMm || !widthMm) return { height: BOX, width: BOX * 0.6 };
  const long = Math.max(lengthMm, widthMm);
  const short = Math.min(lengthMm, widthMm);
  return { height: BOX, width: Math.max(MIN_SIDE, (short / long) * BOX) };
}

function EdgeButton({
  on,
  label,
  vertical,
  size,
  onToggle,
}: {
  on: boolean;
  label: string;
  vertical: boolean;
  size: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onToggle}
      style={vertical ? { height: size } : { width: size }}
      className={`flex items-center justify-center ${vertical ? "w-10" : "h-10"}`}
    >
      <span
        className={`block rounded-full ${vertical ? "h-full w-1.5" : "h-1.5 w-full"} ${
          on ? "bg-ink" : "border border-dashed border-muted bg-transparent"
        }`}
      />
    </button>
  );
}

export function EdgePicker({
  edges,
  onChange,
  lengthMm,
  widthMm,
  quantity,
  longLabel,
  shortLabel,
}: {
  edges: Edges;
  onChange: (edges: Edges) => void;
  lengthMm: Mm | null;
  widthMm: Mm | null;
  quantity: number;
  longLabel: string;
  shortLabel: string;
}) {
  const { height, width } = boxSize(lengthMm, widthMm);
  const bandedLengths = Number(edges.left) + Number(edges.right);
  const bandedWidths = Number(edges.top) + Number(edges.bottom);
  const each = lengthMm && widthMm ? pieceBandingMm({ lengthMm, widthMm, bandedLengths, bandedWidths }) : 0;
  const total = each * (Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
  const toggle = (edge: keyof Edges) => onChange({ ...edges, [edge]: !edges[edge] });
  const all = bandedLengths + bandedWidths === 4;

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-semibold">Edge banding: tap each edge that gets banded</legend>
      <p className="text-sm text-muted">Left and right are the long sides, top and bottom the short sides.</p>
      <input type="hidden" name="bandedLengths" value={bandedLengths} />
      <input type="hidden" name="bandedWidths" value={bandedWidths} />

      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="grid grid-cols-[auto_auto_auto] items-center justify-items-center">
          <span />
          <EdgeButton on={edges.top} label="Top edge (short side)" vertical={false} size={width} onToggle={() => toggle("top")} />
          <span />
          <EdgeButton on={edges.left} label="Left edge (long side)" vertical size={height} onToggle={() => toggle("left")} />
          <div
            style={{ width, height }}
            className="flex flex-col items-center justify-center rounded-sm bg-timber text-center text-xs leading-tight"
          >
            <span className="font-semibold">{longLabel}</span>
            <span className="text-muted">×</span>
            <span className="font-semibold">{shortLabel}</span>
          </div>
          <EdgeButton on={edges.right} label="Right edge (long side)" vertical size={height} onToggle={() => toggle("right")} />
          <span />
          <EdgeButton on={edges.bottom} label="Bottom edge (short side)" vertical={false} size={width} onToggle={() => toggle("bottom")} />
          <span />
        </div>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-semibold">
              {bandedLengths} of 2 long sides, {bandedWidths} of 2 short sides
            </span>
            {total > 0 && (
              <span className="block text-muted">
                {(total / 1000).toFixed(2)} m of banding
                {quantity > 1 && ` for all ${quantity}`}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange(all ? NO_EDGES : { left: true, right: true, top: true, bottom: true })}
              className="min-h-10 rounded-md px-3 font-semibold ring-1 ring-line"
            >
              {all ? "Clear all" : "All 4 edges"}
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

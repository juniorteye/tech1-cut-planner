import type { BoardLayout, Placement } from "@/lib/planner/types";
import type { Mm } from "@/lib/types";

type Line = { x1: number; y1: number; x2: number; y2: number };

/** Long-side banding goes on the piece's longer edges, however it lies on the board. */
function bandedLines(placed: Placement): Line[] {
  const { x, y, lengthMm: across, widthMm: down } = placed;
  const horizontal = [
    { x1: x, y1: y, x2: x + across, y2: y },
    { x1: x, y1: y + down, x2: x + across, y2: y + down },
  ];
  const vertical = [
    { x1: x, y1: y, x2: x, y2: y + down },
    { x1: x + across, y1: y, x2: x + across, y2: y + down },
  ];
  const [lengthEdges, widthEdges] = across >= down ? [horizontal, vertical] : [vertical, horizontal];
  return [
    ...lengthEdges.slice(0, placed.bandedLengths ?? 0),
    ...widthEdges.slice(0, placed.bandedWidths ?? 0),
  ];
}

/**
 * One board, drawn to scale. `largestMm` is the longest sheet in the plan:
 * every board is drawn at its own length against it, so an offcut from the
 * store shows small next to a full sheet instead of filling the same width.
 */
export function BoardDiagram({ board, largestMm = board.lengthMm }: { board: BoardLayout; largestMm?: Mm }) {
  const { lengthMm, widthMm } = board;
  const scale = Math.min(100, (lengthMm / largestMm) * 100);
  const text = Math.max(lengthMm, widthMm) * 0.06;
  const band = Math.max(lengthMm, widthMm) * 0.005;

  return (
    <svg
      viewBox={`0 0 ${lengthMm} ${widthMm}`}
      role="img"
      aria-label={`${board.materialName}: ${board.placements.length} pieces`}
      style={{ width: `${scale}%` }}
      data-scale={scale.toFixed(1)}
      className="block rounded-sm border border-ink bg-[#c6c8c2]"
    >
      {board.placements.map((placed) => (
        <g key={placed.number}>
          <rect
            x={placed.x}
            y={placed.y}
            width={placed.lengthMm}
            height={placed.widthMm}
            fill="var(--color-timber)"
            stroke="#a6875c"
            strokeWidth={Math.max(lengthMm, widthMm) * 0.002}
          />
          {bandedLines(placed).map((line, i) => (
            <line key={i} {...line} stroke="var(--color-ink)" strokeWidth={band} strokeLinecap="square" />
          ))}
          <text
            x={placed.x + placed.lengthMm / 2}
            y={placed.y + placed.widthMm / 2}
            fontSize={Math.min(text, placed.widthMm * 0.7, placed.lengthMm * 0.5)}
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-ink)"
          >
            {placed.number}
          </text>
        </g>
      ))}
      {board.offcuts.map((offcut) => (
        <rect
          key={`${offcut.x}-${offcut.y}`}
          x={offcut.x}
          y={offcut.y}
          width={offcut.lengthMm}
          height={offcut.widthMm}
          fill="var(--color-keep)"
          stroke="var(--color-keep-ink)"
          strokeWidth={Math.max(lengthMm, widthMm) * 0.002}
          strokeDasharray={`${text / 3} ${text / 3}`}
        />
      ))}
    </svg>
  );
}

export function DiagramLegend({ banding = false }: { banding?: boolean }) {
  const items = [
    ["bg-timber", "Your pieces"],
    ["bg-keep", "Saved for later"],
    ["bg-[#c6c8c2]", "Waste"],
    ...(banding ? [["bg-timber border-l-4 border-l-ink", "Edge banding"]] : []),
  ];

  return (
    <ul className="flex flex-wrap gap-4 text-sm text-muted">
      {items.map(([color, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`size-3.5 rounded-sm border border-line ${color}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

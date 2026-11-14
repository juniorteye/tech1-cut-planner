import type { PlankLayout } from "@/lib/planner/types";

/** One plank, drawn to scale against the longest plank in the plan. */
export function PlankDiagram({ plank, longestMm = plank.lengthMm }: { plank: PlankLayout; longestMm?: number }) {
  const percent = (mm: number) => `${(mm / plank.lengthMm) * 100}%`;

  return (
    <div
      className="relative h-9 overflow-hidden rounded-sm border border-ink bg-[#c6c8c2]"
      style={{ width: `${Math.min(100, (plank.lengthMm / longestMm) * 100)}%` }}
    >
      {plank.cuts.map((cut) => (
        <div
          key={cut.number}
          className="absolute inset-y-0 flex items-center justify-center overflow-hidden border-x border-[#a6875c] bg-timber text-sm font-bold"
          style={{ left: percent(cut.startMm), width: percent(cut.lengthMm) }}
        >
          {cut.number}
        </div>
      ))}
      {plank.offcutMm > 0 && (
        <div
          className="absolute inset-y-0 right-0 border-l border-dashed border-keep-ink bg-keep"
          style={{ width: percent(plank.offcutMm) }}
        />
      )}
    </div>
  );
}

import type { JobPlan } from "@/lib/planner/types";
import type { DisplayUnit } from "@/lib/types";
import { formatSize } from "@/lib/units";
import { BoardDiagram, DiagramLegend } from "./board-diagram";
import { Card } from "./card";
import { PlankDiagram } from "./plank-diagram";

export function PlanBoards({ plan, unit }: { plan: JobPlan; unit: DisplayUnit }) {
  return (
    <>
      {plan.boards.length > 0 && <DiagramLegend banding={(plan.banding ?? []).length > 0} />}
      {plan.boards.map((board, index) => (
        <Card key={index}>
          <h2 className="font-display text-xl font-bold">
            Board {index + 1}: {board.materialName}
          </h2>
          <p className="mb-2 text-sm text-muted">
            {board.source === "leftover" ? "From your leftover store" : "New sheet"} ·{" "}
            {formatSize(board.lengthMm, board.widthMm, unit)}
            {board.trimMm > 0 && ` · trim ${board.trimMm} mm each edge`}
          </p>
          <BoardDiagram board={board} />
          {board.offcuts.length > 0 && (
            <p className="mt-2 text-sm text-keep-ink">
              Keep:{" "}
              {board.offcuts.map((o, i) => (
                <span key={i} className="whitespace-nowrap">
                  {formatSize(o.lengthMm, o.widthMm, unit)}
                  {i < board.offcuts.length - 1 && ", "}
                </span>
              ))}
            </p>
          )}
        </Card>
      ))}
      {plan.planks.length > 0 && (
        <Card title="Planks">
          <div className="space-y-4">
            {plan.planks.map((plank, index) => (
              <div key={index}>
                <p className="mb-1 text-sm text-muted">
                  {plank.materialName} · {plank.source === "leftover" ? "from your leftover store" : "new plank"} ·{" "}
                  {formatSize(plank.lengthMm, null, unit)}
                  {plank.offcutMm > 0 && ` · keep ${formatSize(plank.offcutMm, null, unit)}`}
                </p>
                <PlankDiagram plank={plank} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

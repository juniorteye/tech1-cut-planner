import { planGroups, countLabel } from "@/lib/planner/plan-groups";
import type { JobPlan } from "@/lib/planner/types";
import type { DisplayUnit } from "@/lib/types";
import { formatMetres, formatSize } from "@/lib/units";
import { BoardDiagram, DiagramLegend } from "./board-diagram";
import { Card } from "./card";
import { PlankDiagram } from "./plank-diagram";

/** The boards, grouped by board type with the sections cut from each, then the planks. */
export function PlanBoards({ plan, unit }: { plan: JobPlan; unit: DisplayUnit }) {
  const groups = planGroups(plan).filter((group) => group.kind === "board");
  const numbered = plan.boards.map((board, index) => ({ board, number: index + 1 }));
  // Everything is drawn against the longest sheet and the longest plank, so sizes compare at a glance.
  const largest = Math.max(...plan.boards.map((board) => board.lengthMm), 1);
  const longest = Math.max(...plan.planks.map((plank) => plank.lengthMm), 1);

  return (
    <>
      {plan.boards.length > 0 && (
        <div>
          <DiagramLegend banding={(plan.banding ?? []).length > 0} />
          <p className="mt-1 text-sm text-muted">Every board and plank is drawn to scale.</p>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.materialId} aria-label={group.materialName} data-board-group className="space-y-3">
          <div className="border-b-2 border-ink pb-1">
            <h2 className="font-display text-2xl font-bold">{group.materialName}</h2>
            <p className="text-sm text-muted">
              {group.sections.length > 0 && (
                <>
                  <span className="font-semibold text-ink">
                    {group.sections.length === 1 ? "Section" : "Sections"}: {group.sections.join(", ")}
                  </span>{" "}
                  ·{" "}
                </>
              )}
              {countLabel(group)} to buy
              {group.fromStore > 0 && ` + ${group.fromStore} from the store`}
              {group.bandingMm > 0 && ` · ${formatMetres(group.bandingMm)} banding`}
            </p>
          </div>
          {numbered
            .filter(({ board }) => board.materialId === group.materialId)
            .map(({ board, number }) => (
              <Card key={number}>
                <h3 className="font-display text-xl font-bold">
                  Board {number}: {board.materialName}
                </h3>
                <p className="mb-2 text-sm text-muted">
                  {board.source === "leftover" ? "From your leftover store" : "New sheet"} ·{" "}
                  {formatSize(board.lengthMm, board.widthMm, unit)}
                  {board.trimMm > 0 && ` · trim ${board.trimMm} mm each edge`}
                </p>
                <BoardDiagram board={board} largestMm={largest} />
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
        </section>
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
                <PlankDiagram plank={plank} longestMm={longest} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

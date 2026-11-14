import type { JobPlan, PlanGroup } from "./types";

/**
 * Totals per board or timber. Plans saved before sections have no groups, so
 * they are worked out from the boards and planks: no section names, and the
 * banding only where the old per-board banding lines name the board.
 */
export function planGroups(plan: JobPlan): PlanGroup[] {
  if (plan.groups) return plan.groups;
  const groups: PlanGroup[] = [];
  const stock = [
    ...plan.boards.map((board) => ({ ...board, kind: "board" as const })),
    ...plan.planks.map((plank) => ({ ...plank, kind: "timber" as const })),
  ];
  for (const entry of stock) {
    let group = groups.find((g) => g.materialId === entry.materialId);
    if (!group) {
      group = {
        materialId: entry.materialId,
        materialName: entry.materialName,
        kind: entry.kind,
        sections: [],
        toBuy: plan.buy.filter((item) => item.materialId === entry.materialId).reduce((sum, item) => sum + item.count, 0),
        fromStore: 0,
        bandingMm: (plan.banding ?? [])
          .filter((line) => line.colour === undefined && line.materialName === entry.materialName)
          .reduce((sum, line) => sum + line.mm, 0),
      };
      groups.push(group);
    }
    if (entry.source === "leftover") group.fromStore += 1;
  }
  return groups;
}

/** "3 boards", "1 plank": what to buy of one board or timber. */
export function countLabel(group: Pick<PlanGroup, "kind" | "toBuy">) {
  const noun = group.kind === "board" ? "board" : "plank";
  return `${group.toBuy} ${noun}${group.toBuy === 1 ? "" : "s"}`;
}

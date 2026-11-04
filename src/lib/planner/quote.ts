import type { Job, Pesewas } from "../types";
import type { JobPlan } from "./types";

/** Whole sheets bills everything bought; part used bills only the wood in the pieces. */
export function quoteTotal(
  plan: JobPlan,
  { quoteMode, wasteAllowancePercent }: Pick<Job, "quoteMode" | "wasteAllowancePercent">,
): Pesewas {
  if (quoteMode === "whole-sheets") {
    return plan.buyCost + plan.leftoverCost;
  }

  const boards = plan.boards.reduce((sum, board) => {
    const used = board.placements.reduce((s, p) => s + p.lengthMm * p.widthMm, 0);
    return sum + (used / (board.lengthMm * board.widthMm)) * board.value;
  }, 0);
  const planks = plan.planks.reduce((sum, plank) => {
    const used = plank.cuts.reduce((s, cut) => s + cut.lengthMm, 0);
    return sum + (used / plank.lengthMm) * plank.value;
  }, 0);

  return Math.round((boards + planks) * (1 + wasteAllowancePercent / 100));
}

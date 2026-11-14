import type { DisplayUnit, Mm, Pesewas } from "../types";
import { formatMetres, formatMoney, formatSize } from "../units.ts";
import { bandingByColour } from "./banding.ts";
import type { JobPlan } from "./types";

export type ShoppingList = {
  items: { name: string; size: string; count: number; unitPrice: Pesewas; total: Pesewas; kind: "board" | "plank" }[];
  banding: { colour: string; mm: Mm }[];
  total: Pesewas;
  fromStore: number;
};

/** What to buy for a plan: boards and planks per type, tape per colour, and what the wood costs. */
export function shoppingList(plan: JobPlan, unit: DisplayUnit): ShoppingList {
  return {
    items: plan.buy.map((item) => ({
      name: item.name,
      size: formatSize(item.lengthMm, item.widthMm, unit),
      count: item.count,
      unitPrice: item.unitPrice,
      total: item.unitPrice * item.count,
      kind: item.widthMm === null ? "plank" : "board",
    })),
    banding: bandingByColour(plan.banding),
    total: plan.buyCost,
    fromStore: [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover").length,
  };
}

/** Plain text for WhatsApp: no tables, one thing per line, *bold* headings. */
export function shoppingText(list: ShoppingList, job: { name: string; customer: string }, sets: number) {
  const title = `${job.name}${sets > 1 ? ` × ${sets} sets` : ""}${job.customer ? ` (${job.customer})` : ""}`;
  const lines = [`*Shopping list: ${title}*`, ""];
  if (list.items.length > 0) {
    lines.push("*Boards and timber*");
    for (const item of list.items) {
      const noun = item.kind === "board" ? (item.count === 1 ? "board" : "boards") : item.count === 1 ? "plank" : "planks";
      lines.push(`• ${item.count} ${noun} ${item.name}, ${item.size}: ${formatMoney(item.total)}`);
    }
    lines.push("");
  }
  if (list.banding.length > 0) {
    lines.push("*Edge banding*");
    for (const line of list.banding) lines.push(`• ${line.colour}: ${formatMetres(line.mm)}`);
    lines.push("");
  }
  lines.push(`*Total for the wood: ${formatMoney(list.total)}*`);
  if (list.fromStore > 0) {
    lines.push(`${list.fromStore} ${list.fromStore === 1 ? "piece comes" : "pieces come"} from the offcut store, not bought.`);
  }
  return lines.join("\n");
}

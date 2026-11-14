import type { JobPlan } from "./types";

export type PlanNote = { numbers: string; name: string; note: string };

/** "1–3, 7": part numbers written as ranges. */
export function numberRanges(numbers: number[]) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const ranges: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let end = i;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    ranges.push(end === i ? String(sorted[i]) : `${sorted[i]}–${sorted[end]}`);
    i = end;
  }
  return ranges.join(", ");
}

/** Every note in the plan, once per part, with the numbers it applies to. */
export function planNotes(plan: JobPlan): PlanNote[] {
  const cut = [...plan.boards.flatMap((b) => b.placements), ...plan.planks.flatMap((p) => p.cuts)];
  const groups = new Map<string, { name: string; note: string; numbers: number[] }>();
  for (const part of cut) {
    if (!part.note) continue;
    const key = `${part.name}\u0000${part.note}`;
    const group = groups.get(key) ?? { name: part.name, note: part.note, numbers: [] };
    group.numbers.push(part.number);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => Math.min(...a.numbers) - Math.min(...b.numbers))
    .map((g) => ({ numbers: numberRanges(g.numbers), name: g.name, note: g.note }));
}

import type { Mm, Pesewas } from "../types";
import type { PlankCut, PlankLeftover, PlannerCut } from "./types";

export type PlankStock = {
  lengthMm: Mm;
  price: Pesewas;
};

export type PlankPackInput = {
  cuts: PlannerCut[];
  stock: PlankStock[];
  leftovers: PlankLeftover[];
  kerfMm: Mm;
  minLeftoverLengthMm: Mm;
};

export type PackedPlank = {
  source: "plank" | "leftover";
  leftoverId: string | null;
  lengthMm: Mm;
  value: Pesewas;
  cuts: PlankCut[];
  offcutMm: Mm;
  offcutValue: Pesewas;
  wasteMm: Mm;
};

export type PlankPackResult = {
  planks: PackedPlank[];
  unplaced: PlannerCut[];
};

type Bar = {
  source: "plank" | "leftover";
  leftoverId: string | null;
  lengthMm: Mm;
  value: Pesewas;
  used: Mm;
  cuts: PlannerCut[];
};

const FILL_BIASES = [0.5, 1, 1.5];
const MAX_EXACT_CUTS = 14;

function usedWith(bar: Bar, cut: PlannerCut, kerfMm: Mm) {
  return bar.used + (bar.cuts.length > 0 ? kerfMm : 0) + cut.lengthMm;
}

/** Tightest bar first: long leftovers stay whole for jobs that need them. */
function fitInto(bars: Bar[], cut: PlannerCut, kerfMm: Mm) {
  let best: Bar | null = null;
  for (const bar of bars) {
    const used = usedWith(bar, cut, kerfMm);
    if (used <= bar.lengthMm && (!best || bar.lengthMm - used < best.lengthMm - usedWith(best, cut, kerfMm))) {
      best = bar;
    }
  }
  if (best) {
    best.used = usedWith(best, cut, kerfMm);
    best.cuts.push(cut);
  }
  return best !== null;
}

function cheapestFor(used: Mm, stock: PlankStock[]): PlankStock | undefined {
  return stock
    .filter((s) => s.lengthMm >= used)
    .sort((a, b) => a.price - b.price || a.lengthMm - b.lengthMm)[0];
}

function finishBar(bar: Bar, kerfMm: Mm, minLeftoverLengthMm: Mm): PackedPlank {
  const rest = bar.lengthMm - bar.used - kerfMm;
  const offcutMm = rest >= minLeftoverLengthMm && rest > 0 ? rest : 0;

  let start = 0;
  const cuts = bar.cuts.map((cut) => {
    const placed = { number: cut.number, name: cut.name, startMm: start, lengthMm: cut.lengthMm };
    start += cut.lengthMm + kerfMm;
    return placed;
  });

  return {
    source: bar.source,
    leftoverId: bar.leftoverId,
    lengthMm: bar.lengthMm,
    value: bar.value,
    cuts,
    offcutMm,
    offcutValue: Math.round((offcutMm / bar.lengthMm) * bar.value),
    wasteMm: bar.lengthMm - bar.used - offcutMm,
  };
}

function fillLeftovers(cuts: PlannerCut[], input: PlankPackInput) {
  const bars: Bar[] = [...input.leftovers]
    .sort((a, b) => a.lengthMm - b.lengthMm)
    .map((leftover) => ({
      source: "leftover",
      leftoverId: leftover.id,
      lengthMm: leftover.lengthMm,
      value: leftover.value,
      used: 0,
      cuts: [],
    }));
  const rest = cuts.filter((cut) => !fitInto(bars, cut, input.kerfMm));
  return { bars: bars.filter((bar) => bar.cuts.length > 0), rest };
}

function attempt(cuts: PlannerCut[], opening: PlankStock | null, input: PlankPackInput) {
  const { bars: leftovers, rest } = fillLeftovers(cuts, input);
  const planks: Bar[] = [];
  const unplaced: PlannerCut[] = [];

  for (const cut of rest) {
    if (fitInto(planks, cut, input.kerfMm)) {
      continue;
    }
    const stock =
      opening && opening.lengthMm >= cut.lengthMm ? opening : cheapestFor(cut.lengthMm, input.stock);
    if (!stock) {
      unplaced.push(cut);
      continue;
    }
    planks.push({
      source: "plank",
      leftoverId: null,
      lengthMm: stock.lengthMm,
      value: stock.price,
      used: cut.lengthMm,
      cuts: [cut],
    });
  }

  // Once a plank's cuts are settled, buy the cheapest length that still holds them.
  for (const plank of planks) {
    const cheaper = cheapestFor(plank.used, input.stock);
    if (cheaper && cheaper.price < plank.value) {
      plank.lengthMm = cheaper.lengthMm;
      plank.value = cheaper.price;
    }
  }

  return { bars: [...leftovers, ...planks], unplaced };
}

/** The cuts that fill this length best, found in whole mm with a kerf allowed per cut. */
function bestFill(cuts: PlannerCut[], lengthMm: Mm, kerfMm: Mm) {
  const capacity = Math.floor(lengthMm + kerfMm);
  const lastCut = new Int32Array(capacity + 1).fill(-1);
  const reachable = new Uint8Array(capacity + 1);
  reachable[0] = 1;

  cuts.forEach((cut, index) => {
    const size = Math.ceil(cut.lengthMm + kerfMm);
    for (let used = capacity; used >= size; used--) {
      if (!reachable[used] && reachable[used - size]) {
        reachable[used] = 1;
        lastCut[used] = index;
      }
    }
  });

  let used = capacity;
  while (used > 0 && !reachable[used]) used--;

  const chosen: PlannerCut[] = [];
  while (used > 0) {
    const index = lastCut[used];
    chosen.push(cuts[index]);
    used -= Math.ceil(cuts[index].lengthMm + kerfMm);
  }
  return chosen;
}

/** Fills one bar at a time. A flat spread buys bigger, fuller planks; a steep one favours cheap ones. */
function attemptByFill(cuts: PlannerCut[], input: PlankPackInput, bias: number) {
  const { bars: leftovers, rest } = fillLeftovers(cuts, input);
  const planks: Bar[] = [];
  let remaining = rest;

  while (remaining.length > 0) {
    let best: { stock: PlankStock; chosen: PlannerCut[]; rate: number } | null = null;
    for (const stock of input.stock) {
      const chosen = bestFill(remaining, stock.lengthMm, input.kerfMm);
      const filled = chosen.reduce((sum, cut) => sum + cut.lengthMm, 0);
      const rate = stock.price ** bias / filled;
      if (chosen.length > 0 && (!best || rate < best.rate)) {
        best = { stock, chosen, rate };
      }
    }
    if (!best) break;

    const { stock, chosen } = best;
    planks.push({
      source: "plank",
      leftoverId: null,
      lengthMm: stock.lengthMm,
      value: stock.price,
      used: chosen.reduce((sum, cut) => sum + cut.lengthMm, 0) + (chosen.length - 1) * input.kerfMm,
      cuts: chosen,
    });
    remaining = remaining.filter((cut) => !chosen.includes(cut));
  }

  return { bars: [...leftovers, ...planks], unplaced: remaining };
}

/**
 * The true cheapest set of planks, by trying every way to group the cuts.
 * The work grows threefold with each cut, so this only runs on smaller lists.
 */
function attemptExact(cuts: PlannerCut[], input: PlankPackInput) {
  const { bars: leftovers, rest } = fillLeftovers(cuts, input);
  const count = rest.length;
  if (count > MAX_EXACT_CUTS) return null;

  const all = (1 << count) - 1;
  const groupCost = new Float64Array(all + 1).fill(Infinity);
  const groupStock: (PlankStock | undefined)[] = new Array(all + 1);

  for (let group = 1; group <= all; group++) {
    let used = -input.kerfMm;
    for (let i = 0; i < count; i++) {
      if (group & (1 << i)) used += rest[i].lengthMm + input.kerfMm;
    }
    groupStock[group] = cheapestFor(used, input.stock);
    groupCost[group] = groupStock[group]?.price ?? Infinity;
  }

  const total = new Float64Array(all + 1).fill(Infinity);
  const firstGroup = new Int32Array(all + 1);
  total[0] = 0;
  for (let cutsLeft = 1; cutsLeft <= all; cutsLeft++) {
    // Every grouping holds the lowest cut somewhere, so only groups with it are tried.
    const lowest = cutsLeft & -cutsLeft;
    for (let group = cutsLeft; group > 0; group = (group - 1) & cutsLeft) {
      if (group & lowest && groupCost[group] + total[cutsLeft ^ group] < total[cutsLeft]) {
        total[cutsLeft] = groupCost[group] + total[cutsLeft ^ group];
        firstGroup[cutsLeft] = group;
      }
    }
  }

  if (total[all] === Infinity) return null;

  const planks: Bar[] = [];
  for (let cutsLeft = all; cutsLeft > 0; cutsLeft ^= firstGroup[cutsLeft]) {
    const group = firstGroup[cutsLeft];
    const stock = groupStock[group]!;
    const chosen = rest.filter((_, i) => group & (1 << i));
    planks.push({
      source: "plank",
      leftoverId: null,
      lengthMm: stock.lengthMm,
      value: stock.price,
      used: chosen.reduce((sum, cut) => sum + cut.lengthMm, 0) + (chosen.length - 1) * input.kerfMm,
      cuts: chosen,
    });
  }
  return { bars: [...leftovers, ...planks], unplaced: [] as PlannerCut[] };
}

function costOf(bars: Bar[]) {
  return bars.reduce((sum, bar) => sum + (bar.source === "plank" ? bar.value : 0), 0);
}

export function packPlanks(input: PlankPackInput): PlankPackResult {
  const sorted = [...input.cuts].sort((a, b) => b.lengthMm - a.lengthMm);
  const openings = input.stock.length > 0 ? input.stock : [null];

  const attempts = [
    ...openings.map((opening) => attempt(sorted, opening, input)),
    ...FILL_BIASES.map((bias) => attemptByFill(sorted, input, bias)),
  ];
  const exact = attemptExact(sorted, input);
  if (exact) attempts.push(exact);
  const best = attempts.reduce((a, b) =>
    b.unplaced.length < a.unplaced.length ||
    (b.unplaced.length === a.unplaced.length && costOf(b.bars) < costOf(a.bars))
      ? b
      : a,
  );

  return {
    planks: best.bars.map((bar) => finishBar(bar, input.kerfMm, input.minLeftoverLengthMm)),
    unplaced: best.unplaced,
  };
}

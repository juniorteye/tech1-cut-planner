import type { Mm, Pesewas } from "../types";
import type { BoardLeftover, Placement, PlannerPiece, Rect } from "./types";

export type BoardPackInput = {
  pieces: PlannerPiece[];
  sheet: { lengthMm: Mm; widthMm: Mm; trimMm: Mm; price: Pesewas };
  leftovers: BoardLeftover[];
  kerfMm: Mm;
  minLeftoverShortSideMm: Mm;
  minLeftoverAreaMm2: number;
};

export type PackedBoard = {
  source: "sheet" | "leftover";
  leftoverId: string | null;
  lengthMm: Mm;
  widthMm: Mm;
  trimMm: Mm;
  value: Pesewas;
  placements: Placement[];
  offcuts: Rect[];
  offcutValues: Pesewas[];
  wasteMm2: number;
};

export type BoardPackResult = {
  boards: PackedBoard[];
  unplaced: PlannerPiece[];
};

type Bin = Omit<PackedBoard, "offcuts" | "offcutValues" | "wasteMm2"> & {
  free: Rect[];
};

type SplitRule = "shorter" | "longer" | "along-length" | "along-width";

/** The tightest fit for one piece can ruin the sheet for the rest, so turning is tried both ways. */
type Turning = "tightest" | "upright" | "turned";

const SPLIT_RULES: SplitRule[] = ["shorter", "longer", "along-length", "along-width"];
const TURNINGS: Turning[] = ["tightest", "upright", "turned"];

const ORDERINGS: ((a: PlannerPiece, b: PlannerPiece) => number)[] = [
  (a, b) => b.lengthMm * b.widthMm - a.lengthMm * a.widthMm,
  (a, b) => Math.max(b.lengthMm, b.widthMm) - Math.max(a.lengthMm, a.widthMm),
  (a, b) => Math.min(b.lengthMm, b.widthMm) - Math.min(a.lengthMm, a.widthMm),
  (a, b) => b.lengthMm + b.widthMm - (a.lengthMm + a.widthMm),
];

/** Seeded, so the plan a user accepts is the same plan they were shown. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function area(rect: { lengthMm: Mm; widthMm: Mm }) {
  return rect.lengthMm * rect.widthMm;
}

function orientations(piece: PlannerPiece) {
  const upright = { lengthMm: piece.lengthMm, widthMm: piece.widthMm, turned: false };
  if (piece.grainLocked || piece.lengthMm === piece.widthMm) {
    return [upright];
  }
  return [upright, { lengthMm: piece.widthMm, widthMm: piece.lengthMm, turned: true }];
}

function tightestFit(bin: Bin, options: ReturnType<typeof orientations>) {
  let best: { free: Rect; lengthMm: Mm; widthMm: Mm; turned: boolean } | null = null;
  let bestScore = Infinity;

  for (const free of bin.free) {
    for (const o of options) {
      if (o.lengthMm > free.lengthMm || o.widthMm > free.widthMm) {
        continue;
      }
      const score = Math.min(free.lengthMm - o.lengthMm, free.widthMm - o.widthMm);
      if (score < bestScore) {
        bestScore = score;
        best = { free, ...o };
      }
    }
  }
  return best;
}

function bestFit(bin: Bin, piece: PlannerPiece, turning: Turning) {
  const options = orientations(piece);
  if (turning === "tightest") {
    return tightestFit(bin, options);
  }
  const preferred = options.filter((o) => o.turned === (turning === "turned"));
  return tightestFit(bin, preferred) ?? tightestFit(bin, options);
}

/**
 * Every split runs edge to edge across a free rectangle, so a saw can always
 * make the cuts. The kerf is lost on the side of the cut away from the piece.
 */
function place(bin: Bin, piece: PlannerPiece, kerfMm: Mm, rule: SplitRule, turning: Turning) {
  const fit = bestFit(bin, piece, turning);
  if (!fit) {
    return false;
  }

  const { free, lengthMm, widthMm, turned } = fit;
  bin.placements.push({
    x: free.x,
    y: free.y,
    lengthMm,
    widthMm,
    turned,
    number: piece.number,
    name: piece.name,
    bandedLengths: piece.bandedLengths ?? 0,
    bandedWidths: piece.bandedWidths ?? 0,
    ...(piece.section !== undefined && { section: piece.section }),
    ...(piece.note && { note: piece.note }),
  });

  const restLength = free.lengthMm - lengthMm;
  const restWidth = free.widthMm - widthMm;
  const cutAcrossWidth =
    rule === "along-width" ||
    (rule === "shorter" && restLength < restWidth) ||
    (rule === "longer" && restLength >= restWidth);

  const beside: Rect = {
    x: free.x + lengthMm + kerfMm,
    y: free.y,
    lengthMm: restLength - kerfMm,
    widthMm: cutAcrossWidth ? free.widthMm : widthMm,
  };
  const above: Rect = {
    x: free.x,
    y: free.y + widthMm + kerfMm,
    lengthMm: cutAcrossWidth ? lengthMm : free.lengthMm,
    widthMm: restWidth - kerfMm,
  };

  bin.free = bin.free.filter((rect) => rect !== free);
  for (const rect of [beside, above]) {
    if (rect.lengthMm > 0 && rect.widthMm > 0) {
      bin.free.push(rect);
    }
  }
  return true;
}

function newSheet({ sheet }: BoardPackInput): Bin {
  return {
    source: "sheet",
    leftoverId: null,
    lengthMm: sheet.lengthMm,
    widthMm: sheet.widthMm,
    trimMm: sheet.trimMm,
    value: sheet.price,
    placements: [],
    free: [
      {
        x: sheet.trimMm,
        y: sheet.trimMm,
        lengthMm: sheet.lengthMm - 2 * sheet.trimMm,
        widthMm: sheet.widthMm - 2 * sheet.trimMm,
      },
    ],
  };
}

function leftoverBin(leftover: BoardLeftover): Bin {
  return {
    source: "leftover",
    leftoverId: leftover.id,
    lengthMm: leftover.lengthMm,
    widthMm: leftover.widthMm,
    trimMm: 0,
    value: leftover.value,
    placements: [],
    free: [{ x: 0, y: 0, lengthMm: leftover.lengthMm, widthMm: leftover.widthMm }],
  };
}

function isKeepable(rect: Rect, input: BoardPackInput) {
  return (
    Math.min(rect.lengthMm, rect.widthMm) >= input.minLeftoverShortSideMm &&
    area(rect) >= input.minLeftoverAreaMm2
  );
}

/** True if straight edge-to-edge cuts can separate every rectangle. */
export function isGuillotine(rects: Rect[]): boolean {
  if (rects.length <= 1) return true;

  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "lengthMm" : "widthMm";
    for (const rect of rects) {
      const line = rect[axis] + rect[size];
      const before = rects.filter((r) => r[axis] + r[size] <= line);
      const after = rects.filter((r) => r[axis] >= line);
      if (before.length > 0 && after.length > 0 && before.length + after.length === rects.length) {
        return isGuillotine(before) && isGuillotine(after);
      }
    }
  }
  return false;
}

function joined(a: Rect, b: Rect, kerfMm: Mm): Rect | null {
  if (a.y === b.y && a.widthMm === b.widthMm && a.x + a.lengthMm + kerfMm === b.x) {
    return { ...a, lengthMm: a.lengthMm + kerfMm + b.lengthMm };
  }
  if (a.x === b.x && a.lengthMm === b.lengthMm && a.y + a.widthMm + kerfMm === b.y) {
    return { ...a, widthMm: a.widthMm + kerfMm + b.widthMm };
  }
  return null;
}

/** One big offcut beats two small ones, as long as the sheet can still be cut. */
function mergeFree(free: Rect[], placements: Placement[], kerfMm: Mm) {
  let merged = free;

  for (let changed = true; changed; ) {
    changed = false;
    search: for (const a of merged) {
      for (const b of merged) {
        const combined = a === b ? null : joined(a, b, kerfMm);
        if (!combined) continue;
        const next = [...merged.filter((rect) => rect !== a && rect !== b), combined];
        if (isGuillotine([...placements, ...next])) {
          merged = next;
          changed = true;
          break search;
        }
      }
    }
  }
  return merged;
}

function finishBin(bin: Bin, input: BoardPackInput): PackedBoard {
  const { free, ...rest } = bin;
  const offcuts = mergeFree(free, bin.placements, input.kerfMm).filter((rect) => isKeepable(rect, input));
  const binArea = area(bin);
  const offcutValues = offcuts.map((rect) => Math.round((area(rect) / binArea) * bin.value));
  const used = bin.placements.reduce((sum, placed) => sum + area(placed), 0);
  const kept = offcuts.reduce((sum, rect) => sum + area(rect), 0);

  return { ...rest, offcuts, offcutValues, wasteMm2: binArea - used - kept };
}

/** Smallest leftovers first, so big offcuts stay available for big pieces. */
function sortedLeftovers(input: BoardPackInput) {
  return [...input.leftovers].sort((a, b) => area(a) - area(b));
}

function attempt(pieces: PlannerPiece[], input: BoardPackInput, rule: SplitRule, turning: Turning) {
  const leftovers = sortedLeftovers(input).map(leftoverBin);
  const sheets: Bin[] = [];
  const unplaced: PlannerPiece[] = [];

  for (const piece of pieces) {
    if ([...leftovers, ...sheets].some((bin) => place(bin, piece, input.kerfMm, rule, turning))) {
      continue;
    }
    const sheet = newSheet(input);
    if (place(sheet, piece, input.kerfMm, rule, turning)) {
      sheets.push(sheet);
    } else {
      unplaced.push(piece);
    }
  }

  const boards = [...leftovers, ...sheets]
    .filter((bin) => bin.placements.length > 0)
    .map((bin) => finishBin(bin, input));

  return { boards, unplaced };
}

function pick<T>(options: T[], random: () => number) {
  return options[Math.floor(random() * options.length)];
}

/** Tries many arrangements on one empty board and keeps the one holding the most wood. */
function fullestBin(
  empty: () => Bin,
  pieces: PlannerPiece[],
  input: BoardPackInput,
  tries: number,
  random: () => number,
) {
  let best = empty();
  let bestUsed = 0;

  for (let i = 0; i < tries; i++) {
    const bin = empty();
    const rule = pick(SPLIT_RULES, random);
    // Identical pieces share a direction, which is how a carpenter lays them out.
    const turnings = new Map<string, Turning>();
    const order = shuffled([...pieces].sort(pick(ORDERINGS, random)), random);

    for (const piece of order) {
      const size = `${piece.lengthMm}x${piece.widthMm}`;
      const turning = turnings.get(size) ?? pick(TURNINGS, random);
      turnings.set(size, turning);
      place(bin, piece, input.kerfMm, rule, turning);
    }

    const used = bin.placements.reduce((sum, placed) => sum + area(placed), 0);
    if (used > bestUsed) {
      best = bin;
      bestUsed = used;
    }
  }
  return best;
}

function attemptByBoard(input: BoardPackInput, tries: number, random: () => number): BoardPackResult {
  const bins: Bin[] = [];
  let remaining = input.pieces;

  const fill = (empty: () => Bin) => {
    const bin = fullestBin(empty, remaining, input, tries, random);
    const placed = new Set(bin.placements.map((placement) => placement.number));
    remaining = remaining.filter((piece) => !placed.has(piece.number));
    if (placed.size > 0) {
      bins.push(bin);
    }
    return placed.size > 0;
  };

  for (const leftover of sortedLeftovers(input)) {
    if (remaining.length === 0) break;
    fill(() => leftoverBin(leftover));
  }
  while (remaining.length > 0 && fill(() => newSheet(input))) {
    // Each pass fills one more sheet. What will not fit an empty sheet stays in remaining.
  }

  return { boards: bins.map((bin) => finishBin(bin, input)), unplaced: remaining };
}

function score({ boards, unplaced }: BoardPackResult) {
  const sheets = boards.filter((board) => board.source === "sheet").length;
  const onLeftovers = boards
    .filter((board) => board.source === "leftover")
    .reduce((sum, board) => sum + board.placements.reduce((s, p) => s + area(p), 0), 0);
  const waste = boards.reduce((sum, board) => sum + board.wasteMm2, 0);
  const offcutSpread = boards
    .flatMap((board) => board.offcuts)
    .reduce((sum, rect) => sum + area(rect) ** 2, 0);

  return { missing: unplaced.length, sheets, onLeftovers, waste, offcutSpread };
}

/** Nothing left out, then fewest new sheets, most wood from the store, least waste, and one big offcut over many small ones. */
function isBetter(a: ReturnType<typeof score>, b: ReturnType<typeof score>) {
  if (a.missing !== b.missing) return a.missing < b.missing;
  if (a.sheets !== b.sheets) return a.sheets < b.sheets;
  if (a.onLeftovers !== b.onLeftovers) return a.onLeftovers > b.onLeftovers;
  if (a.waste !== b.waste) return a.waste < b.waste;
  return a.offcutSpread > b.offcutSpread;
}

function shuffled(pieces: PlannerPiece[], random: () => number) {
  const order = [...pieces];
  const swaps = Math.max(1, Math.floor(order.length / 4));
  for (let i = 0; i < swaps; i++) {
    const a = Math.floor(random() * order.length);
    const b = Math.min(order.length - 1, a + 1 + Math.floor(random() * 4));
    [order[a], order[b]] = [order[b], order[a]];
  }
  return order;
}

export function packBoards(input: BoardPackInput): BoardPackResult {
  if (input.pieces.length === 0) {
    return { boards: [], unplaced: [] };
  }

  // Fixed work rather than a time limit, so results never depend on server speed.
  const rounds = Math.max(10, Math.min(100, Math.floor(8e5 / input.pieces.length ** 2)));
  const restarts = Math.max(3, Math.min(40, Math.floor(4e3 / input.pieces.length)));
  const tries = Math.max(10, Math.min(120, Math.floor(6e3 / input.pieces.length)));
  const random = seededRandom(input.pieces.length * 7919);
  let best: BoardPackResult | null = null;
  let bestScore: ReturnType<typeof score> | null = null;

  const keep = (result: BoardPackResult) => {
    const current = score(result);
    if (!bestScore || isBetter(current, bestScore)) {
      best = result;
      bestScore = current;
    }
  };

  const consider = (order: PlannerPiece[]) => {
    for (const rule of SPLIT_RULES) {
      for (const turning of TURNINGS) {
        keep(attempt(order, input, rule, turning));
      }
    }
  };

  for (const ordering of ORDERINGS) {
    const order = [...input.pieces].sort(ordering);
    consider(order);
    for (let round = 0; round < rounds; round++) {
      consider(shuffled(order, random));
    }
  }

  for (let restart = 0; restart < restarts; restart++) {
    keep(attemptByBoard(input, tries, random));
  }

  return best!;
}

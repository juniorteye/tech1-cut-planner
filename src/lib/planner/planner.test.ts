import assert from "node:assert/strict";
import { test } from "node:test";
import type { Board, Leftover, Piece, Timber } from "../types";
import { describeEdges, jobBanding, pieceBandingMm } from "./banding.ts";
import { isGuillotine, packBoards, type BoardPackInput } from "./boards.ts";
import { packPlanks } from "./planks.ts";
import { planJob } from "./plan-job.ts";
import { quoteTotal } from "./quote.ts";
import type { PlannerPiece, Rect } from "./types";

const sheet = { lengthMm: 2440, widthMm: 1220, trimMm: 0, price: 45000 };
const base = { leftovers: [], kerfMm: 5, minLeftoverShortSideMm: 100, minLeftoverAreaMm2: 90000 };

function pieces(specs: [number, number, number, boolean?][]) {
  let number = 0;
  const out: PlannerPiece[] = [];
  for (const [lengthMm, widthMm, quantity, grainLocked] of specs) {
    for (let i = 0; i < quantity; i++) {
      out.push({ number: ++number, name: `P${number}`, lengthMm, widthMm, grainLocked: grainLocked ?? false });
    }
  }
  return out;
}

function gapOrOverlap(a: Rect, b: Rect) {
  const dx = Math.max(a.x - (b.x + b.lengthMm), b.x - (a.x + a.lengthMm));
  const dy = Math.max(a.y - (b.y + b.widthMm), b.y - (a.y + a.widthMm));
  return Math.max(dx, dy);
}

function checkLayout(input: BoardPackInput) {
  const { boards, unplaced } = packBoards(input);
  const placed = boards.flatMap((board) => board.placements.map((p) => p.number));

  assert.equal(placed.length + unplaced.length, input.pieces.length, "every piece is accounted for");
  assert.equal(new Set(placed).size, placed.length, "no piece is placed twice");

  for (const board of boards) {
    const { placements, offcuts, trimMm, lengthMm, widthMm } = board;
    for (const p of [...placements, ...offcuts]) {
      assert.ok(p.x >= trimMm && p.y >= trimMm, "inside the trim");
      assert.ok(p.x + p.lengthMm <= lengthMm - trimMm + 1e-6 && p.y + p.widthMm <= widthMm - trimMm + 1e-6, "inside the board");
    }
    const all = [...placements, ...offcuts];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        assert.ok(gapOrOverlap(all[i], all[j]) >= input.kerfMm - 1e-6, "a blade width between pieces");
      }
    }
    assert.ok(isGuillotine([...placements, ...offcuts]), "cuttable with straight saw cuts");
    assert.ok(board.wasteMm2 >= -1e-6, "waste is never negative");
    for (const p of placements) {
      const source = input.pieces.find((piece) => piece.number === p.number)!;
      if (source.grainLocked) assert.equal(p.turned, false, "grain-locked pieces are never turned");
      const [l, w] = p.turned ? [source.widthMm, source.lengthMm] : [source.lengthMm, source.widthMm];
      assert.deepEqual([p.lengthMm, p.widthMm], [l, w], "piece keeps its size");
    }
  }
  return { boards, unplaced };
}

test("the PDF's kitchen cabinet fits on one sheet with waste around the PDF's figure or better", () => {
  const { boards, unplaced } = checkLayout({
    ...base,
    sheet,
    pieces: pieces([[720, 560, 2], [600, 560, 2], [564, 520, 2]]),
  });
  assert.equal(unplaced.length, 0);
  assert.equal(boards.length, 1);
  const wastePercent = (boards[0].wasteMm2 / (2440 * 1220)) * 100;
  assert.ok(wastePercent <= 15.5, `waste was ${wastePercent}`);
});

test("side-by-side free space becomes one offcut, not two", () => {
  const { boards } = checkLayout({
    ...base,
    sheet,
    pieces: pieces([[720, 560, 2], [600, 560, 2], [564, 520, 2]]),
  });
  const biggest = Math.max(...boards[0].offcuts.map((o) => o.lengthMm * o.widthMm));
  assert.ok(biggest > 560 * 497, `biggest offcut is only ${biggest} mm²`);
});

test("uses a stored leftover before opening a new sheet", () => {
  const { boards } = checkLayout({
    ...base,
    sheet,
    pieces: pieces([[500, 400, 1]]),
    leftovers: [{ id: "L1", lengthMm: 695, widthMm: 655, value: 5000 }],
  });
  assert.equal(boards.length, 1);
  assert.equal(boards[0].source, "leftover");
  assert.equal(boards[0].leftoverId, "L1");
});

test("a job that fits the first of several leftovers leaves the others alone", () => {
  const { boards, unplaced } = checkLayout({
    ...base,
    sheet,
    pieces: pieces([[1900, 200, 1, true]]),
    leftovers: [
      { id: "small", lengthMm: 500, widthMm: 400, value: 3000 },
      { id: "strip", lengthMm: 1990, widthMm: 209, value: 6000 },
      { id: "big", lengthMm: 2440, widthMm: 772, value: 28000 },
    ],
  });
  assert.equal(unplaced.length, 0);
  assert.deepEqual(boards.map((board) => board.leftoverId), ["strip"]);
});

test("a grain-locked piece that only fits turned is reported, not turned", () => {
  const { boards, unplaced } = packBoards({ ...base, sheet, pieces: pieces([[1300, 2000, 1, true]]) });
  assert.equal(boards.length, 0);
  assert.equal(unplaced.length, 1);
  const free = packBoards({ ...base, sheet, pieces: pieces([[1200, 2000, 1, false]]) });
  assert.equal(free.boards[0].placements[0].turned, true);
});

test("a piece bigger than any stock is reported, never silently dropped", () => {
  const { boards, unplaced } = packBoards({ ...base, sheet, pieces: pieces([[3000, 1300, 1], [300, 300, 1]]) });
  assert.equal(unplaced.length, 1);
  assert.equal(boards.length, 1);
});

test("two pieces that only fit the same oversized leftover: the second is reported", () => {
  const { boards, unplaced } = packBoards({
    ...base,
    sheet: { ...sheet, lengthMm: 1000, widthMm: 1000 },
    pieces: pieces([[1500, 900, 2, true]]),
    leftovers: [{ id: "L1", lengthMm: 1600, widthMm: 1000, value: 100 }],
  });
  assert.equal(boards.length, 1);
  assert.equal(unplaced.length, 1);
});

test("edge trim is respected and an exact full-sheet piece still fits without trim", () => {
  assert.equal(packBoards({ ...base, sheet, pieces: pieces([[2440, 1220, 1, true]]) }).unplaced.length, 0);
  assert.equal(packBoards({ ...base, sheet: { ...sheet, trimMm: 10 }, pieces: pieces([[2440, 1220, 1, true]]) }).unplaced.length, 1);
  const { boards } = checkLayout({ ...base, sheet: { ...sheet, trimMm: 10 }, pieces: pieces([[2420, 1200, 1, true]]) });
  assert.equal(boards[0].placements[0].x, 10);
});

test("the sheet count stays close to the area limit", () => {
  const { boards } = checkLayout({ ...base, sheet, pieces: pieces([[600, 400, 30], [300, 300, 20]]) });
  const needed = Math.ceil((30 * 600 * 400 + 20 * 300 * 300) / (2440 * 1220));
  assert.ok(boards.length <= needed + 1, `${boards.length} sheets, area limit ${needed}`);
});

test("a wardrobe that fits three sheets is planned on three, turning free pieces to suit", () => {
  const { boards, unplaced } = checkLayout({
    ...base,
    kerfMm: 3,
    sheet,
    pieces: pieces([[2000, 560, 2, true], [1990, 445, 2, true], [864, 560, 2], [864, 540, 3]]),
  });
  assert.equal(unplaced.length, 0);
  assert.equal(boards.length, 3);
});

test("a job cut from known sheets never needs more once normal waste is left out", () => {
  // Two columns of three drawers per sheet, with room to spare: the answer is two sheets.
  const { boards } = checkLayout({ ...base, kerfMm: 3, sheet, pieces: pieces([[1100, 380, 12, true]]) });
  assert.equal(boards.length, 2);
});

test("random jobs always give valid, cuttable layouts", () => {
  let seed = 12345;
  const random = (limit: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % limit;
  };
  for (let run = 0; run < 12; run++) {
    const specs = Array.from({ length: 1 + random(8) }, (): [number, number, number, boolean] => [
      100 + random(1500), 80 + random(900), 1 + random(5), random(2) === 0,
    ]);
    checkLayout({ ...base, kerfMm: 1 + random(6), sheet: { ...sheet, trimMm: random(2) * 10 }, pieces: pieces(specs) });
  }
});

test("the same input always gives the same plan", () => {
  const input = { ...base, sheet, pieces: pieces([[600, 400, 9], [300, 250, 7]]) };
  assert.deepEqual(packBoards(input), packBoards(input));
});

test("a large job finishes within a few seconds", () => {
  const started = Date.now();
  packBoards({ ...base, sheet, pieces: pieces([[600, 400, 60], [300, 250, 80], [800, 150, 60]]) });
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test("planks: kerf is allowed for and the cheapest suitable length is bought", () => {
  const stock = [{ lengthMm: 3658, price: 8000 }, { lengthMm: 4877, price: 11000 }];
  const cuts = [1, 2].map((number) => ({ number, name: "Leg", lengthMm: 1800 }));
  const { planks, unplaced } = packPlanks({ cuts, stock, leftovers: [], kerfMm: 5, minLeftoverLengthMm: 300 });
  assert.equal(unplaced.length, 0);
  assert.equal(planks.length, 1);
  assert.equal(planks[0].lengthMm, 3658);
  assert.equal(planks[0].cuts[1].startMm, 1805);

  const tight = packPlanks({
    cuts: [1, 2].map((number) => ({ number, name: "Leg", lengthMm: 1829 })),
    stock: [stock[0]], leftovers: [], kerfMm: 5, minLeftoverLengthMm: 300,
  });
  assert.equal(tight.planks.length, 2, "two 1829 cuts and a kerf do not fit one 3658 plank");
});

test("planks: leftovers go first and oversized cuts are reported", () => {
  const stock = [{ lengthMm: 3658, price: 8000 }];
  const { planks, unplaced } = packPlanks({
    cuts: [{ number: 1, name: "Rail", lengthMm: 900 }, { number: 2, name: "Beam", lengthMm: 5000 }],
    stock, leftovers: [{ id: "L1", lengthMm: 1000, value: 2000 }], kerfMm: 5, minLeftoverLengthMm: 300,
  });
  assert.equal(planks.length, 1);
  assert.equal(planks[0].source, "leftover");
  assert.deepEqual(unplaced.map((u) => u.name), ["Beam"]);
  assert.equal(packPlanks({ cuts: [{ number: 1, name: "X", lengthMm: 100 }], stock: [], leftovers: [], kerfMm: 3, minLeftoverLengthMm: 300 }).unplaced.length, 1);
});

test("planks: mixes lengths when that is the true cheapest", () => {
  const stock = [{ lengthMm: 2438.4, price: 6000 }, { lengthMm: 3657.6, price: 8000 }];
  const { planks } = packPlanks({
    cuts: [3000, 2000].map((lengthMm, i) => ({ number: i + 1, name: "Cut", lengthMm })),
    stock, leftovers: [], kerfMm: 3, minLeftoverLengthMm: 300,
  });
  assert.equal(planks.reduce((sum, plank) => sum + plank.value, 0), 14000);
});

test("planks: a long list stays complete and finishes quickly", () => {
  const started = Date.now();
  const cuts = Array.from({ length: 120 }, (_, i) => ({ number: i + 1, name: "Rail", lengthMm: 300 + (i * 37) % 2000 }));
  const { planks, unplaced } = packPlanks({
    cuts, stock: [{ lengthMm: 3657.6, price: 8000 }, { lengthMm: 4267.2, price: 9500 }], leftovers: [], kerfMm: 3, minLeftoverLengthMm: 300,
  });
  assert.equal(unplaced.length, 0);
  assert.equal(planks.reduce((sum, plank) => sum + plank.cuts.length, 0), 120);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started} ms`);
});

const record = { workshopId: "w" };
const ply: Board = {
  ...record, id: "ply", kind: "board", name: "Ply 18", boardType: "plywood", lengthMm: 2440, widthMm: 1220,
  thicknessMm: 18, pricePerSheet: 45000, edgeTrimMm: 0, minLeftoverShortSideMm: 100, minLeftoverAreaMm2: 90000,
};
const twoByFour: Timber = {
  ...record, id: "t", kind: "timber", name: "2 × 4", minLeftoverLengthMm: 300,
  lengths: [{ lengthMm: 3658, pricePerPiece: 8000 }],
};
const piece = (over: Partial<Piece>): Piece => ({
  ...record, id: "p", jobId: "j", materialId: "ply", name: "Side", lengthMm: 720, widthMm: 560, quantity: 2, grainLocked: false,
  bandedLengths: 0, bandedWidths: 0, ...over,
});

test("planJob totals what to buy, numbers pieces and records offcuts", () => {
  const plan = planJob({
    pieces: [piece({}), piece({ id: "q", materialId: "t", name: "Rail", lengthMm: 1000, widthMm: null, quantity: 3 })],
    materials: [ply, twoByFour], leftovers: [], kerfMm: 5,
  });
  assert.equal(plan.pieceCount, 5);
  assert.deepEqual(plan.buy.map((b) => [b.name, b.count]), [["Ply 18", 1], ["2 × 4", 1]]);
  assert.equal(plan.buyCost, 53000);
  assert.deepEqual([...plan.boards[0].placements.map((p) => p.number), ...plan.planks[0].cuts.map((c) => c.number)].sort(), [1, 2, 3, 4, 5]);
  assert.ok(plan.offcuts.length >= 2);
  assert.ok(plan.boardWastePercent !== null && plan.plankWastePercent !== null);
});

test("planJob ignores leftovers that are reserved, used or for another material", () => {
  const stored = (over: Partial<Leftover>): Leftover => ({
    ...record, id: "L", materialId: "ply", lengthMm: 900, widthMm: 700, status: "available", value: 9000, sourceJobId: null, usedByJobId: null, ...over,
  });
  const plan = planJob({
    pieces: [piece({ quantity: 1 })], materials: [ply, twoByFour], kerfMm: 5,
    leftovers: [stored({ id: "a", status: "reserved" }), stored({ id: "b", status: "damaged" }), stored({ id: "c", materialId: "t" })],
  });
  assert.equal(plan.leftoverIds.length, 0);
  const used = planJob({ pieces: [piece({ quantity: 1 })], materials: [ply], kerfMm: 5, leftovers: [stored({ id: "d" })] });
  assert.deepEqual(used.leftoverIds, ["d"]);
  assert.equal(used.buyCost, 0);
  assert.equal(used.leftoverCost, 9000);
});

test("quotes: whole sheets bills the sheet, part used bills the area plus allowance", () => {
  const plan = planJob({ pieces: [piece({ lengthMm: 1220, widthMm: 1220, quantity: 1 })], materials: [ply], leftovers: [], kerfMm: 5 });
  assert.equal(quoteTotal(plan, { quoteMode: "whole-sheets", wasteAllowancePercent: 10 }), 45000);
  assert.equal(quoteTotal(plan, { quoteMode: "part-used", wasteAllowancePercent: 0 }), 22500);
  assert.equal(quoteTotal(plan, { quoteMode: "part-used", wasteAllowancePercent: 10 }), 24750);
});

// The client's console sketch, in cm as written: length × width – quantity, banded long sides, banded short sides.
const CONSOLE: [number, number, number, number, number][] = [
  [210, 35, 1, 1, 0],
  [206.4, 10, 4, 1, 0],
  [26.4, 35, 4, 1, 0],
  [28.2, 38, 2, 1, 0],
  [213.6, 38, 1, 1, 2],
  [70, 12, 6, 1, 0],
  [30, 12, 6, 1, 0],
  [70, 30, 3, 2, 2],
];
const consolePieces = (material = "ply") =>
  CONSOLE.map(([length, width, quantity, bandedLengths, bandedWidths], i) =>
    piece({ id: `c${i}`, materialId: material, name: `Part ${i + 1}`, lengthMm: length * 10, widthMm: width * 10, quantity, bandedLengths, bandedWidths }),
  );

test("banding: a long mark bands the longer side, whichever size was typed first", () => {
  assert.equal(pieceBandingMm({ lengthMm: 2136, widthMm: 380, bandedLengths: 1, bandedWidths: 2 }), 2896);
  assert.equal(pieceBandingMm({ lengthMm: 264, widthMm: 350, bandedLengths: 1, bandedWidths: 0 }), 350);
  assert.equal(pieceBandingMm({ lengthMm: 264, widthMm: 350, bandedLengths: 0, bandedWidths: 1 }), 264);
  assert.equal(pieceBandingMm({ lengthMm: 700, widthMm: 300, bandedLengths: 2, bandedWidths: 2 }), 2000);
  assert.equal(pieceBandingMm({ lengthMm: 900, widthMm: null, bandedLengths: 0, bandedWidths: 0 }), 0);
  assert.equal(describeEdges({ bandedLengths: 2, bandedWidths: 2 }), "all 4 edges");
  assert.equal(describeEdges({ bandedLengths: 1, bandedWidths: 2 }), "1 long + 2 short");
  assert.equal(describeEdges({ bandedLengths: 0, bandedWidths: 0 }), "none");
});

test("banding: the console sketch comes to 27.41 m, with no edge missed", () => {
  const [line] = jobBanding(consolePieces(), [ply, twoByFour]);
  assert.equal(Math.round(line.mm), 27412);
  assert.equal(line.materialName, "Ply 18");
});

test("banding: timber never counts, and each board material is totalled apart", () => {
  const mel: Board = { ...ply, id: "mel", name: "Melamine 16" };
  const lines = jobBanding(
    [
      piece({ bandedLengths: 2, quantity: 1 }),
      piece({ id: "m", materialId: "mel", bandedWidths: 1, quantity: 3 }),
      piece({ id: "t", materialId: "t", widthMm: null, bandedLengths: 2 }),
    ],
    [ply, mel, twoByFour],
  );
  assert.deepEqual(lines.map((l) => [l.materialName, l.mm]), [["Ply 18", 1440], ["Melamine 16", 1680]]);
});

const board4x8: Board = { ...ply, id: "b48", name: "Board 4×8", lengthMm: 2420, widthMm: 1210 };

test("the console on the client's 121 × 242 cm board: every part placed, banding carried into the plan", () => {
  const plan = planJob({ pieces: consolePieces("b48"), materials: [board4x8], leftovers: [], kerfMm: 3 });
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.pieceCount, 27);
  assert.equal(plan.buy[0].count, 2);
  assert.equal(Math.round(plan.banding![0].mm), 27412);
  const top = plan.boards.flatMap((b) => b.placements).find((p) => p.name === "Part 5")!;
  assert.deepEqual([top.bandedLengths, top.bandedWidths], [1, 2]);
});

test("a 212 × 272 cm board takes the whole console on one sheet", () => {
  const big: Board = { ...ply, id: "big", name: "Board 7×9", lengthMm: 2720, widthMm: 2120 };
  const plan = planJob({ pieces: consolePieces("big"), materials: [big], leftovers: [], kerfMm: 3 });
  assert.equal(plan.unplaced.length, 0);
  assert.equal(plan.buy[0].count, 1);
});

test("boards to buy counts only new sheets, never offcuts from the store", () => {
  const offcut: Leftover = {
    ...record, id: "off", materialId: "b48", lengthMm: 1000, widthMm: 500, status: "available", value: 7700, sourceJobId: null, usedByJobId: null,
  };
  const plan = planJob({ pieces: consolePieces("b48"), materials: [board4x8], leftovers: [offcut], kerfMm: 3 });
  const newSheets = plan.boards.filter((board) => board.source === "sheet").length;
  assert.deepEqual(plan.leftoverIds, ["off"]);
  assert.equal(plan.buy[0].count, newSheets);
  assert.equal(plan.buy[0].count, 2);
  assert.equal(plan.boards.length, 3);
});

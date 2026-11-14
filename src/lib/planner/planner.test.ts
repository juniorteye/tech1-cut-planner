import assert from "node:assert/strict";
import { test } from "node:test";
import type { Board, Leftover, Piece, Section, Timber } from "../types";
import { bandingByColour, describeEdges, jobBanding, pieceBandingMm, suggestBandingColour } from "./banding.ts";
import { isGuillotine, packBoards, type BoardPackInput } from "./boards.ts";
import { packPlanks } from "./planks.ts";
import { fitAdvice, fitsBoard } from "./fit.ts";
import { numberRanges, planNotes } from "./notes.ts";
import { countLabel, planGroups } from "./plan-groups.ts";
import { planJob } from "./plan-job.ts";
import { quoteTotal } from "./quote.ts";
import { shoppingList, shoppingText } from "./shopping.ts";
import { splitInTwo } from "./split.ts";
import { groupUnplaced } from "./unplaced.ts";
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
  bandingColour: "Ply 18", noBanding: false,
};
const twoByFour: Timber = {
  ...record, id: "t", kind: "timber", name: "2 × 4", minLeftoverLengthMm: 300,
  lengths: [{ lengthMm: 3658, pricePerPiece: 8000 }],
};
const piece = (over: Partial<Piece>): Piece => ({
  ...record, id: "p", jobId: "j", sectionId: null, materialId: "ply", name: "Side", lengthMm: 720, widthMm: 560, quantity: 2, grainLocked: false,
  bandedLengths: 0, bandedWidths: 0, note: "", ...over,
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
  assert.equal(line.colour, "Ply 18");
});

test("banding: timber never counts, and each board material is totalled apart", () => {
  const mel: Board = { ...ply, id: "mel", name: "Melamine 16", bandingColour: "Melamine 16" };
  const lines = jobBanding(
    [
      piece({ bandedLengths: 2, quantity: 1 }),
      piece({ id: "m", materialId: "mel", bandedWidths: 1, quantity: 3 }),
      piece({ id: "t", materialId: "t", widthMm: null, bandedLengths: 2 }),
    ],
    [ply, mel, twoByFour],
  );
  assert.deepEqual(lines.map((l) => [l.colour, l.mm]), [["Ply 18", 1440], ["Melamine 16", 1680]]);
});

test("banding colours: boards sharing a tape colour share one total", () => {
  const grey48: Board = { ...ply, id: "g48", name: "D-Grey 8×4", bandingColour: "D-Grey" };
  const grey97: Board = { ...ply, id: "g97", name: "D-Grey 9×7", bandingColour: "d-grey ", lengthMm: 2720, widthMm: 2120 };
  const satiya: Board = { ...ply, id: "sat", name: "Satiya", bandingColour: "Satiya" };
  const lines = jobBanding(
    [
      piece({ materialId: "g48", lengthMm: 2100, widthMm: 350, bandedLengths: 1, quantity: 7 }),
      piece({ id: "x", materialId: "g97", lengthMm: 2600, widthMm: 350, bandedLengths: 1, quantity: 6 }),
      piece({ id: "y", materialId: "sat", lengthMm: 1500, widthMm: 700, bandedLengths: 1, quantity: 2 }),
    ],
    [grey48, grey97, satiya],
  );
  // 7 × 2.10 m + 6 × 2.60 m = 30.30 m of D-Grey; 2 × 1.50 m of Satiya.
  assert.deepEqual(lines.map((l) => [l.colour, l.mm]), [["D-Grey", 30300], ["Satiya", 3000]]);
});

test("back panels: a no-banding board counts 0 m, even with old marks, and draws no banded edges", () => {
  const back: Board = { ...ply, id: "back", name: "B-Panel 6 mm", thicknessMm: 6, bandingColour: "B-Panel 6 mm", noBanding: true };
  const pieces = [
    piece({ materialId: "back", lengthMm: 1000, widthMm: 800, bandedLengths: 2, bandedWidths: 2, quantity: 2 }),
    piece({ id: "s", lengthMm: 700, widthMm: 300, bandedLengths: 1, quantity: 1 }),
  ];
  assert.deepEqual(jobBanding(pieces, [ply, back]).map((l) => [l.colour, l.mm]), [["Ply 18", 700]]);
  const plan = planJob({ pieces, materials: [ply, back], leftovers: [], kerfMm: 3 });
  const panels = plan.boards.filter((b) => b.materialId === "back").flatMap((b) => b.placements);
  assert.equal(panels.length, 2);
  assert.ok(panels.every((p) => p.bandedLengths === 0 && p.bandedWidths === 0));
  assert.deepEqual(plan.banding, [{ colour: "Ply 18", mm: 700 }]);
});

test("banding colours: plans saved before colours still read, one line per board name", () => {
  assert.deepEqual(bandingByColour([{ materialName: "Ply 18", mm: 1000 }, { materialName: "ply 18", mm: 500 }, { colour: "Satiya", mm: 200 }]), [
    { colour: "Ply 18", mm: 1500 },
    { colour: "Satiya", mm: 200 },
  ]);
  assert.deepEqual(bandingByColour(undefined), []);
});

test("banding colours: a new board takes the tape of the same board in another size", () => {
  const existing = [
    { name: "D-Grey 18 mm 8×4", bandingColour: "D-Grey 18 mm 8×4", noBanding: false },
    { name: "Satiya", bandingColour: "Satiya tape", noBanding: false },
    { name: "Miniyator 18 mm", bandingColour: "Miniyator", noBanding: false },
    { name: "Back panel 6 mm", bandingColour: "Back panel 6 mm", noBanding: true },
  ];
  assert.equal(suggestBandingColour("D-Grey 18 mm 9 x 7", existing), "D-Grey 18 mm 8×4");
  assert.equal(suggestBandingColour("d-grey 18 mm 272 × 212 cm", existing), "D-Grey 18 mm 8×4");
  assert.equal(suggestBandingColour("Satiya", existing), "Satiya tape");
  assert.equal(suggestBandingColour("Miniyator 18 mm 9×7", existing), "Miniyator");
  assert.equal(suggestBandingColour("Miniyator 9×7", existing), "Miniyator");
  // Thickness sets the tape width, so a 25 mm board is not matched to 18 mm tape.
  assert.equal(suggestBandingColour("D-Grey 25 mm 8×4", existing), null);
  assert.equal(suggestBandingColour("Back panel 6 mm 9×7", existing), null);
  assert.equal(suggestBandingColour("Oak", existing), null);
  assert.equal(suggestBandingColour("  ", existing), null);
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

const section = (id: string, name: string, materialId: string, position: number): Section => ({
  ...record, id, jobId: "j", name, materialId, position,
});

test("sets: 2 sets of the console is every part, board and metre of banding twice over", () => {
  const one = planJob({ pieces: consolePieces("b48"), materials: [board4x8], leftovers: [], kerfMm: 3 });
  const two = planJob({ pieces: consolePieces("b48"), materials: [board4x8], leftovers: [], kerfMm: 3, sets: 2 });
  assert.equal(one.pieceCount, 27);
  assert.equal(two.pieceCount, 54);
  assert.equal(Math.round(two.banding![0].mm), 2 * 27412);
  assert.equal(two.sets, 2);
  assert.ok(two.buy[0].count >= 3 && two.buy[0].count <= 4, `bought ${two.buy[0].count}`);
  assert.equal(two.groups![0].toBuy, two.buy[0].count);
  assert.equal(Math.round(two.groups![0].bandingMm), 2 * 27412);
  // The quantities typed in are left alone: only the plan is multiplied.
  assert.equal(consolePieces("b48")[1].quantity, 4);
});

test("sections: parts are numbered section by section and carry their section's name", () => {
  const grey: Board = { ...ply, id: "grey", name: "D-Grey 18 mm", bandingColour: "D-Grey" };
  const back: Board = { ...ply, id: "back", name: "Back panel 6 mm", thicknessMm: 6, bandingColour: "Back panel 6 mm", noBanding: true };
  const sections = [section("s1", "Miniyator", "grey", 0), section("s2", "B-Panels", "back", 1), section("s3", "D-Grey", "grey", 2)];
  const plan = planJob({
    pieces: [
      // Entered out of order: the D-Grey part first, then a back panel, then a Miniyator part.
      piece({ id: "a", sectionId: "s3", materialId: "grey", name: "Shelf", lengthMm: 2100, widthMm: 350, quantity: 1, bandedLengths: 1 }),
      piece({ id: "b", sectionId: "s2", materialId: "back", name: "Back", lengthMm: 1000, widthMm: 800, quantity: 2, bandedLengths: 2 }),
      piece({ id: "c", sectionId: "s1", materialId: "grey", name: "Side", lengthMm: 2040, widthMm: 835, quantity: 1, bandedLengths: 2, bandedWidths: 2 }),
      piece({ id: "d", sectionId: null, materialId: "grey", name: "Loose", lengthMm: 500, widthMm: 300, quantity: 1 }),
    ],
    materials: [back, grey],
    leftovers: [],
    kerfMm: 3,
    sections,
  });
  const placed = plan.boards.flatMap((b) => b.placements).sort((a, b) => a.number - b.number);
  assert.deepEqual(
    placed.map((p) => [p.number, p.name, p.section]),
    [[1, "Side", "Miniyator"], [2, "Back", "B-Panels"], [3, "Back", "B-Panels"], [4, "Shelf", "D-Grey"], [5, "Loose", "Other parts"]],
  );
  // Grouped in list order, not Setup order: Miniyator's D-Grey comes before the back panels.
  assert.deepEqual(
    plan.groups!.map((g) => [g.materialName, g.sections, g.toBuy, g.bandingMm]),
    [
      // 2 × 2.04 + 2 × 0.835 = 5.75 m for the side, 2.10 m for the shelf.
      ["D-Grey 18 mm", ["Miniyator", "D-Grey", "Other parts"], 1, 5750 + 2100],
      ["Back panel 6 mm", ["B-Panels"], 1, 0],
    ],
  );
  assert.deepEqual(plan.boards.map((b) => b.materialName), ["D-Grey 18 mm", "Back panel 6 mm"]);
  assert.ok(plan.boards[0].placements.some((p) => p.number === 1), "Board 1 holds part 1");
});

test("sections: a timber section is grouped and numbered like the boards", () => {
  const plan = planJob({
    pieces: [piece({ id: "r", sectionId: "t1", materialId: "t", name: "Rail", lengthMm: 1000, widthMm: null, quantity: 2 })],
    materials: [twoByFour],
    leftovers: [],
    kerfMm: 3,
    sections: [section("t1", "Frame", "t", 0)],
    sets: 3,
  });
  assert.equal(plan.pieceCount, 6);
  assert.ok(plan.planks.flatMap((p) => p.cuts).every((cut) => cut.section === "Frame"));
  assert.deepEqual(plan.groups!.map((g) => [g.kind, g.sections, g.toBuy]), [["timber", ["Frame"], 2]]);
});

test("plan groups: a plan saved before sections is grouped from its boards and planks", () => {
  const saved = planJob({
    pieces: [piece({ quantity: 1 }), piece({ id: "r", materialId: "t", name: "Rail", lengthMm: 1000, widthMm: null, quantity: 2 })],
    materials: [ply, twoByFour],
    leftovers: [{ ...record, id: "L", materialId: "ply", lengthMm: 900, widthMm: 700, status: "available", value: 9000, sourceJobId: null, usedByJobId: null }],
    kerfMm: 3,
  });
  // As it was stored before sections and colours: no groups, no sets, banding per board.
  const old = { ...structuredClone(saved), groups: undefined, sets: undefined, banding: [{ materialName: "Ply 18", mm: 1234 }] };
  assert.deepEqual(
    planGroups(old).map((g) => [g.materialName, g.kind, g.sections, g.toBuy, g.fromStore, g.bandingMm]),
    [["Ply 18", "board", [], 0, 1, 1234], ["2 × 4", "timber", [], 1, 0, 0]],
  );
  // A plan with groups is read as saved.
  assert.equal(planGroups(saved), saved.groups);
  assert.equal(countLabel({ kind: "board", toBuy: 1 }), "1 board");
  assert.equal(countLabel({ kind: "board", toBuy: 12 }), "12 boards");
  assert.equal(countLabel({ kind: "timber", toBuy: 2 }), "2 planks");
});

test("banding colours: the longest colour a name starts with wins, and sizes in any form are ignored", () => {
  const boards = [
    { name: "Grey", bandingColour: "Grey", noBanding: false },
    { name: "Grey Oak", bandingColour: "Grey Oak tape", noBanding: false },
    { name: "Walnut 18 mm 8 x 4 ft", bandingColour: "Walnut", noBanding: false },
  ];
  assert.equal(suggestBandingColour("Grey Oak 18 mm", boards), "Grey Oak tape");
  assert.equal(suggestBandingColour("Grey 18 mm", boards), "Grey");
  assert.equal(suggestBandingColour("Greyish", boards), null);
  assert.equal(suggestBandingColour("Walnut 18 mm 9×7", boards), "Walnut");
  assert.equal(suggestBandingColour("WALNUT 18 MM 272 x 212 cm", boards), "Walnut");
});

test("without sections a plan is made exactly as before: Setup order, no section names", () => {
  const mel: Board = { ...ply, id: "mel", name: "Melamine 16", bandingColour: "Melamine 16" };
  const plan = planJob({
    pieces: [piece({ id: "m", materialId: "mel", quantity: 1 }), piece({ quantity: 1 })],
    materials: [ply, mel],
    leftovers: [],
    kerfMm: 3,
  });
  assert.deepEqual(plan.boards.map((b) => b.materialName), ["Ply 18", "Melamine 16"]);
  assert.ok(plan.boards.flatMap((b) => b.placements).every((p) => !("section" in p)));
  assert.equal(plan.sets, 1);
  assert.deepEqual(plan.groups!.map((g) => g.sections), [[], []]);
});

test("sets: offcuts in the store are used first, then new sheets for the rest", () => {
  const offcut: Leftover = {
    ...record, id: "off", materialId: "ply", lengthMm: 800, widthMm: 600, status: "available", value: 5000, sourceJobId: null, usedByJobId: null,
  };
  const plan = planJob({ pieces: [piece({ quantity: 1 })], materials: [ply], leftovers: [offcut], kerfMm: 3, sets: 4 });
  assert.equal(plan.pieceCount, 4);
  assert.deepEqual(plan.leftoverIds, ["off"]);
  assert.equal(plan.groups![0].fromStore, 1);
  assert.equal(plan.groups![0].toBuy, plan.buy[0].count);
  assert.equal(plan.boards.flatMap((b) => b.placements).length, 4);
});

test("sections: a part that fits no board is reported with its section, never dropped", () => {
  const plan = planJob({
    pieces: [
      piece({ id: "big", sectionId: "s1", name: "Plinth", lengthMm: 2800, widthMm: 100, quantity: 2 }),
      piece({ id: "ok", sectionId: "s1", name: "Shelf", quantity: 1 }),
    ],
    materials: [ply],
    leftovers: [],
    kerfMm: 3,
    sections: [section("s1", "Miniyator", "ply", 0)],
    sets: 2,
  });
  assert.equal(plan.pieceCount, 6);
  assert.equal(plan.unplaced.length, 4);
  assert.ok(plan.unplaced.every((p) => p.name === "Plinth" && p.section === "Miniyator" && p.materialName === "Ply 18"));
  assert.equal(plan.boards.flatMap((b) => b.placements).length, 2);
});

test("back panels: per-board banding is 0 even when the colour is shared with a banded board", () => {
  const grey: Board = { ...ply, id: "grey", name: "Grey 18", bandingColour: "Grey" };
  const greyBack: Board = { ...ply, id: "gb", name: "Grey back 6", bandingColour: "Grey", noBanding: true, thicknessMm: 6 };
  const plan = planJob({
    pieces: [
      piece({ materialId: "grey", lengthMm: 1000, widthMm: 500, bandedLengths: 2, quantity: 1 }),
      piece({ id: "b", materialId: "gb", lengthMm: 1000, widthMm: 500, bandedLengths: 2, bandedWidths: 2, quantity: 1 }),
    ],
    materials: [grey, greyBack],
    leftovers: [],
    kerfMm: 3,
  });
  assert.deepEqual(plan.banding, [{ colour: "Grey", mm: 2000 }]);
  assert.deepEqual(plan.groups!.map((g) => [g.materialName, g.bandingMm]), [["Grey 18", 2000], ["Grey back 6", 0]]);
});

test("split: halves the long side and keeps the banding total exactly, whatever the marks", () => {
  for (const [lengthMm, widthMm] of [[2800, 100], [100, 2800], [2700, 1300]] as const) {
    for (const bandedLengths of [0, 1, 2]) {
      for (const bandedWidths of [0, 1, 2]) {
        const whole = { name: "Plinth", lengthMm, widthMm, bandedLengths, bandedWidths, quantity: 20 };
        const halves = splitInTwo(whole);
        const total = halves.reduce((sum, half) => sum + pieceBandingMm(half), 0);
        assert.equal(total, pieceBandingMm(whole), `${lengthMm} × ${widthMm}, ${bandedLengths} long, ${bandedWidths} short`);
        for (const half of halves) {
          assert.equal(Math.max(half.lengthMm, half.widthMm!), Math.max(lengthMm, widthMm) / 2);
          assert.equal(Math.min(half.lengthMm, half.widthMm!), Math.min(lengthMm, widthMm));
          assert.equal(half.quantity, 20);
          assert.equal(half.bandedLengths, bandedLengths);
        }
      }
    }
  }
  const [a, b] = splitInTwo({ name: "Plinth", lengthMm: 2800, widthMm: 100, bandedLengths: 1, bandedWidths: 1 });
  assert.deepEqual([a.name, a.bandedWidths, b.name, b.bandedWidths], ["Plinth (1 of 2)", 1, "Plinth (2 of 2)", 0]);
  // An odd length halves to the tenth of a millimetre the database keeps.
  assert.equal(splitInTwo({ name: "x", lengthMm: 2805.5, widthMm: 100, bandedLengths: 0, bandedWidths: 0 })[0].lengthMm, 1402.75);
  // Timber is cut to length only.
  const [rail] = splitInTwo({ name: "Rail", lengthMm: 5000, widthMm: null, bandedLengths: 0, bandedWidths: 0 });
  assert.deepEqual([rail.lengthMm, rail.widthMm], [2500, null]);
});

test("fit: a part too long for the 8 × 4 is offered the 9 × 7 that takes the same tape", () => {
  const grey48: Board = { ...board4x8, id: "g48", name: "D-Grey 8×4", bandingColour: "D-Grey" };
  const grey97: Board = { ...board4x8, id: "g97", name: "D-Grey 9×7", bandingColour: "D-Grey", lengthMm: 2720, widthMm: 2120 };
  const oak97: Board = { ...board4x8, id: "o97", name: "Oak 9×7", bandingColour: "Oak", lengthMm: 2720, widthMm: 2120 };
  const huge: Board = { ...board4x8, id: "big", name: "Huge", bandingColour: "Huge", lengthMm: 3050, widthMm: 1830 };
  const all = [huge, oak97, grey48, grey97, twoByFour];
  const part = (lengthMm: number, widthMm: number | null, grainLocked = false) => ({ lengthMm, widthMm, grainLocked });

  assert.deepEqual(fitAdvice(part(2100, 350), grey48, all), { kind: "fits" });
  const tall = fitAdvice(part(350, 2600), grey48, all);
  assert.ok(tall.kind === "switch" && tall.to.id === "g97" && tall.reason === "long");
  // 120 × 260 is too long and too wide for 242 × 121; the 9 × 7 takes it.
  const wide = fitAdvice(part(1200, 2600), grey48, all);
  assert.ok(wide.kind === "switch" && wide.to.id === "g97");
  // 130 × 200 fits the length of the 8 × 4 but not its width.
  assert.equal((fitAdvice(part(1300, 2000), grey48, all) as { reason: string }).reason, "wide");
  // 10 × 280 is longer than the 9 × 7 too, but the 305 cm board takes it.
  const plinth = fitAdvice(part(100, 2800), grey48, all);
  assert.ok(plinth.kind === "switch" && plinth.to.id === "big");
  assert.deepEqual(fitAdvice(part(100, 2800), grey48, [grey48, grey97]), { kind: "split", reason: "long" });
  // With the grain locked a part cannot be turned to fit.
  assert.ok(fitsBoard(part(1200, 2000), grey48));
  assert.ok(!fitsBoard(part(1200, 2000, true), grey48));
  // Edge trim counts: 242 cm minus 1 cm each end leaves 240 cm.
  assert.ok(!fitsBoard(part(2410, 100), { ...grey48, edgeTrimMm: 10 }));
  // Timber: a rail longer than every plank has nowhere to go.
  assert.deepEqual(fitAdvice(part(4000, null), twoByFour, all), { kind: "split", reason: "long" });
  assert.deepEqual(fitAdvice(part(3000, null), twoByFour, all), { kind: "fits" });
});

test("unplaced: twenty of the same part are one line, in list order", () => {
  const plan = planJob({
    pieces: [
      piece({ id: "a", sectionId: "s1", name: "Part 1", lengthMm: 2800, widthMm: 100, quantity: 20 }),
      piece({ id: "b", sectionId: "s1", name: "Part 2", lengthMm: 2700, widthMm: 330, quantity: 2 }),
      piece({ id: "c", sectionId: "s1", name: "Shelf", quantity: 1 }),
    ],
    materials: [ply],
    leftovers: [],
    kerfMm: 3,
    sections: [section("s1", "Miniyator", "ply", 0)],
  });
  assert.deepEqual(
    groupUnplaced(plan.unplaced).map((l) => [l.count, l.name, l.section, l.materialName]),
    [[20, "Part 1", "Miniyator", "Ply 18"], [2, "Part 2", "Miniyator", "Ply 18"]],
  );
});

test("shopping list: boards per type, tape per colour, the total, as WhatsApp text", () => {
  const grey: Board = { ...board4x8, id: "grey", name: "D-Grey 8×4", bandingColour: "D-Grey", pricePerSheet: 50000 };
  const plan = planJob({
    pieces: [
      piece({ materialId: "grey", lengthMm: 2100, widthMm: 350, bandedLengths: 1, quantity: 7 }),
      piece({ id: "r", materialId: "t", name: "Rail", lengthMm: 1000, widthMm: null, quantity: 3 }),
    ],
    materials: [grey, twoByFour],
    leftovers: [],
    kerfMm: 3,
    sets: 2,
  });
  const list = shoppingList(plan, "cm");
  // 14 sides at 3 a sheet is 5 sheets; 6 rails at 3 a 12 ft plank is 2 planks.
  assert.deepEqual(list.items.map((i) => [i.kind, i.count, i.name, i.size, i.total]), [
    ["board", 5, "D-Grey 8×4", "242 × 121 cm", 250000],
    ["plank", 2, "2 × 4", "365.8 cm", 16000],
  ]);
  assert.deepEqual(list.banding, [{ colour: "D-Grey", mm: 29400 }]);
  assert.equal(list.total, 266000);
  const text = shoppingText(list, { name: "Kitchens", customer: "Mrs Mensah" }, 2);
  assert.equal(
    text,
    [
      "*Shopping list: Kitchens × 2 sets (Mrs Mensah)*",
      "",
      "*Boards and timber*",
      "• 5 boards D-Grey 8×4, 242 × 121 cm: GH¢ 2,500.00",
      "• 2 planks 2 × 4, 365.8 cm: GH¢ 160.00",
      "",
      "*Edge banding*",
      "• D-Grey: 29.40 m",
      "",
      "*Total for the wood: GH¢ 2,660.00*",
    ].join("\n"),
  );
});

test("notes and sizes travel with the parts into the plan", () => {
  const plan = planJob({
    pieces: [
      piece({ quantity: 2, note: "thick tape on front" }),
      piece({ id: "r", materialId: "t", name: "Rail", lengthMm: 1000, widthMm: null, quantity: 1, note: "pine" }),
      piece({ id: "big", name: "Plinth", lengthMm: 2800, widthMm: 100, quantity: 1 }),
    ],
    materials: [ply, twoByFour],
    leftovers: [],
    kerfMm: 3,
  });
  assert.ok(plan.boards.flatMap((b) => b.placements).filter((p) => p.name === "Side").every((p) => p.note === "thick tape on front"));
  assert.equal(plan.planks[0].cuts[0].note, "pine");
  assert.ok(plan.boards.flatMap((b) => b.placements).every((p) => p.name === "Side" || !("note" in p)));
  assert.deepEqual([plan.unplaced[0].lengthMm, plan.unplaced[0].widthMm], [2800, 100]);
});

test("notes: listed once per part with its numbers as ranges", () => {
  assert.equal(numberRanges([7, 1, 2, 3, 9, 10]), "1–3, 7, 9–10");
  assert.equal(numberRanges([4]), "4");
  const plan = planJob({
    pieces: [piece({ quantity: 3, note: "thick tape on front" }), piece({ id: "b", name: "Back", quantity: 1 }), piece({ id: "c", name: "Top", quantity: 1, note: "grain across" })],
    materials: [ply],
    leftovers: [],
    kerfMm: 3,
  });
  assert.deepEqual(planNotes(plan), [
    { numbers: "1–3", name: "Side", note: "thick tape on front" },
    { numbers: "5", name: "Top", note: "grain across" },
  ]);
});

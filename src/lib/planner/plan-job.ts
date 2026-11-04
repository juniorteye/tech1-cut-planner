import type { Leftover, Material, Mm, Piece } from "../types";
import { packBoards } from "./boards.ts";
import { packPlanks } from "./planks.ts";
import type { BoardLayout, BuyItem, JobPlan, OffcutToSave, PlankLayout, PlannerCut, PlannerPiece, UnplacedPiece } from "./types";

export type PlanJobInput = {
  pieces: Piece[];
  materials: Material[];
  leftovers: Leftover[];
  kerfMm: Mm;
};

function percent(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : null;
}

function addToBuy(buy: BuyItem[], item: Omit<BuyItem, "count">) {
  const existing = buy.find(
    (entry) => entry.materialId === item.materialId && entry.lengthMm === item.lengthMm,
  );
  if (existing) {
    existing.count += 1;
  } else {
    buy.push({ ...item, count: 1 });
  }
}

export function planJob({ pieces, materials, leftovers, kerfMm }: PlanJobInput): JobPlan {
  const boards: BoardLayout[] = [];
  const planks: PlankLayout[] = [];
  const buy: BuyItem[] = [];
  const unplaced: UnplacedPiece[] = [];
  const offcuts: OffcutToSave[] = [];

  let number = 0;
  const numbered = pieces.flatMap((piece) =>
    Array.from({ length: piece.quantity }, () => ({ piece, number: ++number })),
  );

  for (const material of materials) {
    const lines = numbered.filter(({ piece }) => piece.materialId === material.id);
    if (lines.length === 0) {
      continue;
    }
    const stored = leftovers.filter(
      (leftover) => leftover.materialId === material.id && leftover.status === "available",
    );

    if (material.kind === "board") {
      const planned: PlannerPiece[] = lines.map(({ piece, number }) => ({
        number,
        name: piece.name,
        lengthMm: piece.lengthMm,
        widthMm: piece.widthMm ?? piece.lengthMm,
        grainLocked: piece.grainLocked,
      }));
      const result = packBoards({
        pieces: planned,
        sheet: {
          lengthMm: material.lengthMm,
          widthMm: material.widthMm,
          trimMm: material.edgeTrimMm,
          price: material.pricePerSheet,
        },
        leftovers: stored.map((leftover) => ({
          id: leftover.id,
          lengthMm: leftover.lengthMm,
          widthMm: leftover.widthMm ?? 0,
          value: leftover.value,
        })),
        kerfMm,
        minLeftoverShortSideMm: material.minLeftoverShortSideMm,
        minLeftoverAreaMm2: material.minLeftoverAreaMm2,
      });

      for (const board of result.boards) {
        boards.push({ ...board, materialId: material.id, materialName: material.name });
        if (board.source === "sheet") {
          addToBuy(buy, {
            materialId: material.id,
            name: material.name,
            lengthMm: material.lengthMm,
            widthMm: material.widthMm,
            unitPrice: material.pricePerSheet,
          });
        }
        board.offcuts.forEach((rect, index) => {
          offcuts.push({
            materialId: material.id,
            lengthMm: rect.lengthMm,
            widthMm: rect.widthMm,
            value: board.offcutValues[index],
          });
        });
      }
      unplaced.push(
        ...result.unplaced.map(({ number, name }) => ({ number, name, materialName: material.name })),
      );
    } else {
      const cuts: PlannerCut[] = lines.map(({ piece, number }) => ({
        number,
        name: piece.name,
        lengthMm: piece.lengthMm,
      }));
      const result = packPlanks({
        cuts,
        stock: material.lengths.map((length) => ({
          lengthMm: length.lengthMm,
          price: length.pricePerPiece,
        })),
        leftovers: stored.map((leftover) => ({
          id: leftover.id,
          lengthMm: leftover.lengthMm,
          value: leftover.value,
        })),
        kerfMm,
        minLeftoverLengthMm: material.minLeftoverLengthMm,
      });

      for (const plank of result.planks) {
        planks.push({ ...plank, materialId: material.id, materialName: material.name });
        if (plank.source === "plank") {
          addToBuy(buy, {
            materialId: material.id,
            name: material.name,
            lengthMm: plank.lengthMm,
            widthMm: null,
            unitPrice: plank.value,
          });
        }
        if (plank.offcutMm > 0) {
          offcuts.push({
            materialId: material.id,
            lengthMm: plank.offcutMm,
            widthMm: null,
            value: plank.offcutValue,
          });
        }
      }
      unplaced.push(
        ...result.unplaced.map(({ number, name }) => ({ number, name, materialName: material.name })),
      );
    }
  }

  const boardArea = boards.reduce((sum, board) => sum + board.lengthMm * board.widthMm, 0);
  const boardWaste = boards.reduce((sum, board) => sum + board.wasteMm2, 0);
  const plankLength = planks.reduce((sum, plank) => sum + plank.lengthMm, 0);
  const plankWaste = planks.reduce((sum, plank) => sum + plank.wasteMm, 0);

  return {
    boards,
    planks,
    buy,
    unplaced,
    offcuts,
    leftoverIds: [...boards, ...planks].flatMap((stock) => stock.leftoverId ?? []),
    pieceCount: numbered.length,
    boardWastePercent: percent(boardWaste, boardArea),
    plankWastePercent: percent(plankWaste, plankLength),
    buyCost: buy.reduce((sum, item) => sum + item.unitPrice * item.count, 0),
    leftoverCost: [...boards, ...planks].reduce(
      (sum, stock) => sum + (stock.source === "leftover" ? stock.value : 0),
      0,
    ),
  };
}

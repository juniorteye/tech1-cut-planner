import type { Leftover, Material, Mm, Piece, Section } from "../types";
import { jobBanding, pieceBandingMm, takesBanding } from "./banding.ts";
import { packBoards } from "./boards.ts";
import { packPlanks } from "./planks.ts";
import type {
  BoardLayout,
  BuyItem,
  JobPlan,
  OffcutToSave,
  PlanGroup,
  PlankLayout,
  PlannerCut,
  PlannerPiece,
  UnplacedPiece,
} from "./types";

export type PlanJobInput = {
  pieces: Piece[];
  materials: Material[];
  leftovers: Leftover[];
  kerfMm: Mm;
  /** How many times the whole list is made. Defaults to 1. */
  sets?: number;
  /** The job's sections, in list order. Parts are numbered section by section. */
  sections?: Section[];
};

/** Name shown for parts added before sections existed, or whose section has gone. */
export const OTHER_PARTS = "Other parts";

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

export function planJob({ pieces: entered, materials, leftovers, kerfMm, sets = 1, sections }: PlanJobInput): JobPlan {
  const boards: BoardLayout[] = [];
  const planks: PlankLayout[] = [];
  const buy: BuyItem[] = [];
  const unplaced: UnplacedPiece[] = [];
  const offcuts: OffcutToSave[] = [];

  // Every part is made once per set, so 6 doors in a 5-set job are 30 doors.
  const pieces = entered.map((piece) => ({ ...piece, quantity: piece.quantity * sets }));
  const order = (piece: Piece) => {
    const index = sections?.findIndex((section) => section.id === piece.sectionId) ?? -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const sectionName = (piece: Piece) =>
    sections ? (sections.find((section) => section.id === piece.sectionId)?.name ?? OTHER_PARTS) : undefined;
  // Numbered section by section, so the cut sheet reads in the same order as the list.
  const listed = sections ? [...pieces].sort((a, b) => order(a) - order(b)) : pieces;

  let number = 0;
  const numbered = listed.flatMap((piece) =>
    Array.from({ length: piece.quantity }, () => ({ piece, number: ++number, section: sectionName(piece) })),
  );
  const withSection = (section: string | undefined) => (section === undefined ? {} : { section });
  const withNote = (piece: Piece) => (piece.note ? { note: piece.note } : {});

  // Boards follow the list: the board of the first section comes first, so
  // Board 1 holds part 1 and the plan reads in the same order as the job.
  const firstUse = (material: Material) => {
    const index = numbered.findIndex(({ piece }) => piece.materialId === material.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const inListOrder = sections ? [...materials].sort((a, b) => firstUse(a) - firstUse(b)) : materials;

  for (const material of inListOrder) {
    const lines = numbered.filter(({ piece }) => piece.materialId === material.id);
    if (lines.length === 0) {
      continue;
    }
    const stored = leftovers.filter(
      (leftover) => leftover.materialId === material.id && leftover.status === "available",
    );

    if (material.kind === "board") {
      const planned: PlannerPiece[] = lines.map(({ piece, number, section }) => ({
        number,
        name: piece.name,
        ...withSection(section),
        ...withNote(piece),
        lengthMm: piece.lengthMm,
        widthMm: piece.widthMm ?? piece.lengthMm,
        grainLocked: piece.grainLocked,
        // A no-banding board ignores marks left from before it was changed.
        bandedLengths: material.noBanding ? 0 : piece.bandedLengths,
        bandedWidths: material.noBanding ? 0 : piece.bandedWidths,
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
        ...result.unplaced.map((left) => ({
          number: left.number,
          name: left.name,
          materialName: material.name,
          ...withSection(left.section),
          lengthMm: left.lengthMm,
          widthMm: left.widthMm,
        })),
      );
    } else {
      const cuts: PlannerCut[] = lines.map(({ piece, number, section }) => ({
        number,
        name: piece.name,
        lengthMm: piece.lengthMm,
        ...withSection(section),
        ...withNote(piece),
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
        ...result.unplaced.map((left) => ({
          number: left.number,
          name: left.name,
          materialName: material.name,
          ...withSection(left.section),
          lengthMm: left.lengthMm,
          widthMm: null,
        })),
      );
    }
  }

  const groups: PlanGroup[] = inListOrder.flatMap((material): PlanGroup[] => {
    const own = pieces.filter((piece) => piece.materialId === material.id);
    if (own.length === 0) return [];
    const stock = material.kind === "board" ? boards : planks;
    const mine = stock.filter((entry) => entry.materialId === material.id);
    const names = [...new Set(listed.filter((piece) => piece.materialId === material.id).map(sectionName))];
    return [
      {
        materialId: material.id,
        materialName: material.name,
        kind: material.kind,
        sections: names.filter((name): name is string => name !== undefined),
        toBuy: buy.filter((item) => item.materialId === material.id).reduce((sum, item) => sum + item.count, 0),
        fromStore: mine.filter((entry) => entry.source === "leftover").length,
        bandingMm: takesBanding(material)
          ? own.reduce((sum, piece) => sum + pieceBandingMm(piece) * piece.quantity, 0)
          : 0,
      },
    ];
  });

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
    banding: jobBanding(pieces, materials),
    sets,
    groups,
  };
}

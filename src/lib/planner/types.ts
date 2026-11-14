import type { Mm, Pesewas } from "../types";
import type { SavedBandingLine } from "./banding";

export type Rect = {
  x: Mm;
  y: Mm;
  lengthMm: Mm;
  widthMm: Mm;
};

/** One physical piece. A job line with quantity 3 becomes three of these. */
export type PlannerPiece = {
  number: number;
  name: string;
  lengthMm: Mm;
  widthMm: Mm;
  grainLocked: boolean;
  bandedLengths?: number;
  bandedWidths?: number;
};

export type PlannerCut = {
  number: number;
  name: string;
  lengthMm: Mm;
};

/** x runs along the sheet's length, which is also the grain direction. */
export type Placement = Rect & {
  number: number;
  name: string;
  turned: boolean;
  /** Long and short sides banded, so turning does not change them. Missing on plans saved before banding. */
  bandedLengths?: number;
  bandedWidths?: number;
};

export type BoardLeftover = {
  id: string;
  lengthMm: Mm;
  widthMm: Mm;
  value: Pesewas;
};

export type BoardLayout = {
  materialId: string;
  materialName: string;
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

export type PlankLeftover = {
  id: string;
  lengthMm: Mm;
  value: Pesewas;
};

export type PlankCut = {
  number: number;
  name: string;
  startMm: Mm;
  lengthMm: Mm;
};

export type PlankLayout = {
  materialId: string;
  materialName: string;
  source: "plank" | "leftover";
  leftoverId: string | null;
  lengthMm: Mm;
  value: Pesewas;
  cuts: PlankCut[];
  offcutMm: Mm;
  offcutValue: Pesewas;
  wasteMm: Mm;
};

export type BuyItem = {
  materialId: string;
  name: string;
  lengthMm: Mm;
  widthMm: Mm | null;
  unitPrice: Pesewas;
  count: number;
};

export type UnplacedPiece = {
  number: number;
  name: string;
  materialName: string;
};

export type OffcutToSave = {
  materialId: string;
  lengthMm: Mm;
  widthMm: Mm | null;
  value: Pesewas;
};

export type JobPlan = {
  boards: BoardLayout[];
  planks: PlankLayout[];
  buy: BuyItem[];
  unplaced: UnplacedPiece[];
  leftoverIds: string[];
  offcuts: OffcutToSave[];
  pieceCount: number;
  boardWastePercent: number | null;
  plankWastePercent: number | null;
  buyCost: Pesewas;
  leftoverCost: Pesewas;
  /** One line per tape colour. Missing on plans saved before banding; per board on plans saved before colours. */
  banding?: SavedBandingLine[];
};

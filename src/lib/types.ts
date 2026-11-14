/** Sizes are held in mm. Fractions are kept so inch entries stay accurate. */
export type Mm = number;

/** Money is held in pesewas so totals never pick up rounding errors. */
export type Pesewas = number;

export type DisplayUnit = "mm" | "cm" | "ft-in";

export type TeamRole = "owner" | "worker";

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
};

export type Workshop = {
  id: string;
  name: string;
  kerfMm: Mm;
  displayUnit: DisplayUnit;
};

type WorkshopRecord = {
  id: string;
  workshopId: string;
};

export type BoardType = "plywood" | "mdf" | "chipboard" | "melamine";

export type Board = WorkshopRecord & {
  kind: "board";
  name: string;
  boardType: BoardType;
  lengthMm: Mm;
  widthMm: Mm;
  thicknessMm: Mm;
  pricePerSheet: Pesewas;
  edgeTrimMm: Mm;
  minLeftoverShortSideMm: Mm;
  minLeftoverAreaMm2: number;
  /** The edge tape this board takes. Boards with the same colour share one banding total. */
  bandingColour: string;
  /** Back panels and other thin boards: no edges are ever banded. */
  noBanding: boolean;
};

export type TimberLength = {
  lengthMm: Mm;
  pricePerPiece: Pesewas;
};

export type Timber = WorkshopRecord & {
  kind: "timber";
  name: string;
  lengths: TimberLength[];
  minLeftoverLengthMm: Mm;
};

export type Material = Board | Timber;

/** draft → accepted (leftovers reserved) → cut (stock committed). */
export type JobStatus = "draft" | "accepted" | "cut" | "cancelled";

export type QuoteMode = "whole-sheets" | "part-used";

export type Job = WorkshopRecord & {
  name: string;
  customer: string;
  status: JobStatus;
  quoteMode: QuoteMode;
  wasteAllowancePercent: number;
  copiedFromJobId: string | null;
  /** How many times the whole list is made ("5 set Kitchens"). Every part is multiplied by it. */
  sets: number;
};

/** A heading in the job's list, such as Miniyator or B-Panels. One section, one board. */
export type Section = WorkshopRecord & {
  jobId: string;
  name: string;
  /** The board its parts use unless a part says otherwise. */
  materialId: string;
  position: number;
};

export type Piece = WorkshopRecord & {
  jobId: string;
  /** Null only for parts added by the app before sections existed. */
  sectionId: string | null;
  materialId: string;
  name: string;
  lengthMm: Mm;
  /** Null for timber, which is only cut to length. */
  widthMm: Mm | null;
  quantity: number;
  grainLocked: boolean;
  /**
   * How many of the two long sides are banded: 0, 1 or 2. Always 0 for timber.
   * The workshop calls the longer side the length, whichever size was typed first.
   */
  bandedLengths: number;
  /** How many of the two short sides are banded: 0, 1 or 2. */
  bandedWidths: number;
};

export type LeftoverStatus = "available" | "reserved" | "used" | "damaged";

export type Leftover = WorkshopRecord & {
  materialId: string;
  lengthMm: Mm;
  widthMm: Mm | null;
  status: LeftoverStatus;
  /** Share of the original purchase price, fixed when the offcut is created. */
  value: Pesewas;
  sourceJobId: string | null;
  usedByJobId: string | null;
};

import type { Board, Material, Mm, Piece } from "../types";

/**
 * The workshop marks banding on a part drawn tall: a mark on the left is the
 * length, which it always means as the longer side; a mark on the top or
 * bottom is the shorter side. So 26.4 × 35 with a left mark bands a 35 edge.
 */
export type BandedEdges = {
  /** Long sides that get banding: 0, 1 or 2. */
  bandedLengths: number;
  /** Short sides that get banding: 0, 1 or 2. */
  bandedWidths: number;
};

/** Banding metres for one tape colour. */
export type BandingLine = {
  colour: string;
  mm: Mm;
};

/** Plans saved before colours were added kept one line per board material instead. */
export type SavedBandingLine = { colour?: string; materialName?: string; mm: Mm };

const sameColour = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Adds to the total for a colour, matching colours however they were capitalised. */
function addTo(lines: BandingLine[], colour: string, mm: Mm) {
  const existing = lines.find((line) => sameColour(line.colour, colour));
  if (existing) existing.mm += mm;
  else lines.push({ colour: colour.trim(), mm });
}

/** Reads any saved plan's banding as one line per colour. */
export function bandingByColour(lines: SavedBandingLine[] | undefined): BandingLine[] {
  const result: BandingLine[] = [];
  for (const line of lines ?? []) addTo(result, line.colour ?? line.materialName ?? "", line.mm);
  return result;
}

/** Whether a piece on this material can carry banding at all. */
export function takesBanding(material: Material | undefined): material is Board {
  return material?.kind === "board" && !material.noBanding;
}

/** Banding for one physical piece. No allowance for trimming is added. */
export function pieceBandingMm(piece: { lengthMm: Mm; widthMm: Mm | null } & BandedEdges): Mm {
  const width = piece.widthMm ?? 0;
  return piece.bandedLengths * Math.max(piece.lengthMm, width) + piece.bandedWidths * Math.min(piece.lengthMm, width);
}

/**
 * Banding for a whole job, one line per tape colour, in the order the boards
 * are listed. Boards that share a colour share a line. Timber and no-banding
 * boards never count, even if a piece was marked before the board was changed.
 */
export function jobBanding(pieces: Piece[], materials: Material[]): BandingLine[] {
  const lines: BandingLine[] = [];
  for (const material of materials) {
    if (!takesBanding(material)) continue;
    const mm = pieces
      .filter((piece) => piece.materialId === material.id)
      .reduce((sum, piece) => sum + pieceBandingMm(piece) * piece.quantity, 0);
    if (mm > 0) addTo(lines, material.bandingColour, mm);
  }
  return lines;
}

/** Sheet sizes in a board's name, such as 8×4, 9 x 7 ft or 242 × 121 cm. Thickness is kept: it sets the tape width. */
const SHEET_SIZE = /\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*(?:ft|cm|mm))?(?![\w.])/gi;
const plainName = (name: string) => name.replace(SHEET_SIZE, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The tape a new board most likely takes, from the boards already set up.
 * A board with the same name apart from the sheet size ("D-Grey 9×7" next to
 * "D-Grey 8×4") gives its tape. Otherwise the longest board name or colour
 * the new name starts with does ("Grey Oak 18 mm" takes the "Grey Oak"
 * board's tape, not "Grey"). Null when nothing matches.
 */
export function suggestBandingColour(name: string, boards: Pick<Board, "name" | "bandingColour" | "noBanding">[]) {
  const plain = plainName(name);
  if (!plain) return null;
  const withTape = boards.filter((board) => !board.noBanding);
  const sameName = withTape.find((board) => plainName(board.name) === plain);
  if (sameName) return sameName.bandingColour;
  let best: { colour: string; length: number } | null = null;
  for (const board of withTape) {
    for (const words of [plainName(board.name), plainName(board.bandingColour)]) {
      const matches = words !== "" && (plain === words || plain.startsWith(`${words} `));
      if (matches && (!best || words.length > best.length)) best = { colour: board.bandingColour, length: words.length };
    }
  }
  return best?.colour ?? null;
}

/** Words for the parts list and cut sheet. */
export function describeEdges({ bandedLengths, bandedWidths }: BandedEdges) {
  if (bandedLengths === 2 && bandedWidths === 2) return "all 4 edges";
  const parts = [bandedLengths > 0 && `${bandedLengths} long`, bandedWidths > 0 && `${bandedWidths} short`].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" + ") : "none";
}

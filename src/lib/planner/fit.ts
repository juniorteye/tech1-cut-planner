import type { Board, Material, Mm } from "../types";

type Sized = { lengthMm: Mm; widthMm: Mm | null; grainLocked: boolean };

/** Whether one piece can go on a fresh sheet of this board, after its edge trim, turned if the grain allows. */
export function fitsBoard(piece: Sized, board: Pick<Board, "lengthMm" | "widthMm" | "edgeTrimMm">) {
  const length = board.lengthMm - 2 * board.edgeTrimMm;
  const width = board.widthMm - 2 * board.edgeTrimMm;
  const w = piece.widthMm ?? piece.lengthMm;
  const straight = piece.lengthMm <= length && w <= width;
  const turned = !piece.grainLocked && piece.lengthMm <= width && w <= length;
  return straight || turned;
}

export function fitsMaterial(piece: Sized, material: Material) {
  if (material.kind === "board") return piece.widthMm !== null && fitsBoard(piece, material);
  return material.lengths.some((plank) => plank.lengthMm >= piece.lengthMm);
}

export type FitAdvice =
  | { kind: "fits" }
  /** Too big for its board but fits another: offer the switch. */
  | { kind: "switch"; to: Material; reason: "long" | "wide" }
  /** Fits nothing in Setup: offer to split it in two. */
  | { kind: "split"; reason: "long" | "wide" };

const sameColour = (a: Material, b: Material) =>
  a.kind === "board" && b.kind === "board" && a.bandingColour.trim().toLowerCase() === b.bandingColour.trim().toLowerCase();
const area = (m: Material) => (m.kind === "board" ? m.lengthMm * m.widthMm : Math.max(...m.lengths.map((l) => l.lengthMm), 0));

/**
 * What to do about a part that does not fit its board. Another board of the
 * same kind is offered first if it takes the same tape (D-Grey 9×7 for a
 * D-Grey 8×4 part), then the smallest one that fits.
 */
export function fitAdvice(piece: Sized, own: Material | undefined, materials: Material[]): FitAdvice {
  if (!own || fitsMaterial(piece, own)) return { kind: "fits" };
  let reason: "long" | "wide" = "long";
  if (own.kind === "board") {
    const long = Math.max(piece.lengthMm, piece.widthMm ?? 0);
    reason = long > Math.max(own.lengthMm, own.widthMm) - 2 * own.edgeTrimMm ? "long" : "wide";
  }
  const others = materials
    .filter((m) => m.id !== own.id && m.kind === own.kind && fitsMaterial(piece, m))
    .sort((a, b) => Number(sameColour(b, own)) - Number(sameColour(a, own)) || area(a) - area(b));
  return others[0] ? { kind: "switch", to: others[0], reason } : { kind: "split", reason };
}

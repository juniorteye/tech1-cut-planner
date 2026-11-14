import type { Mm } from "../types";

type Splittable = {
  name: string;
  lengthMm: Mm;
  widthMm: Mm | null;
  bandedLengths: number;
  bandedWidths: number;
};

/**
 * A part too long for any board becomes two halves to be joined. The long
 * side is halved; the width and quantity stay. Each half keeps the long-side
 * banding and the original short edge at its own end; the joint ends get
 * none, so the banding total is exactly what it was.
 */
export function splitInTwo<T extends Splittable>(piece: T): [T, T] {
  const lengthIsLong = piece.widthMm === null || piece.lengthMm >= piece.widthMm;
  const halve = (mm: Mm) => Math.round((mm / 2) * 10_000) / 10_000;
  const sized = lengthIsLong
    ? { lengthMm: halve(piece.lengthMm), widthMm: piece.widthMm }
    : { lengthMm: piece.lengthMm, widthMm: halve(piece.widthMm as Mm) };
  // Two banded short edges: one on each half. One: it stays on the first half.
  const firstEnd = piece.bandedWidths >= 1 ? 1 : 0;
  const secondEnd = piece.bandedWidths >= 2 ? 1 : 0;
  return [
    { ...piece, ...sized, name: `${piece.name} (1 of 2)`, bandedWidths: firstEnd },
    { ...piece, ...sized, name: `${piece.name} (2 of 2)`, bandedWidths: secondEnd },
  ];
}

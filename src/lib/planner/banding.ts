import type { Material, Mm, Piece } from "../types";

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

export type BandingLine = {
  materialId: string;
  materialName: string;
  mm: Mm;
};

/** Banding for one physical piece. No allowance for trimming is added. */
export function pieceBandingMm(piece: { lengthMm: Mm; widthMm: Mm | null } & BandedEdges): Mm {
  const width = piece.widthMm ?? 0;
  return piece.bandedLengths * Math.max(piece.lengthMm, width) + piece.bandedWidths * Math.min(piece.lengthMm, width);
}

/** Banding for a whole job, per board material, in the order the materials are listed. */
export function jobBanding(pieces: Piece[], materials: Material[]): BandingLine[] {
  return materials.flatMap((material) => {
    if (material.kind !== "board") return [];
    const mm = pieces
      .filter((piece) => piece.materialId === material.id)
      .reduce((sum, piece) => sum + pieceBandingMm(piece) * piece.quantity, 0);
    return mm > 0 ? [{ materialId: material.id, materialName: material.name, mm }] : [];
  });
}

/** Words for the parts list and cut sheet. */
export function describeEdges({ bandedLengths, bandedWidths }: BandedEdges) {
  if (bandedLengths === 2 && bandedWidths === 2) return "all 4 edges";
  const parts = [bandedLengths > 0 && `${bandedLengths} long`, bandedWidths > 0 && `${bandedWidths} short`].filter(
    Boolean,
  );
  return parts.length > 0 ? parts.join(" + ") : "none";
}

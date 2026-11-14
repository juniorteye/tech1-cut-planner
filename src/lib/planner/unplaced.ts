import type { UnplacedPiece } from "./types";

export type UnplacedLine = { name: string; section?: string; materialName: string; count: number; numbers: number[] };

/** "20 × Part 1" instead of twenty lines: one line per part, in the order they were listed. */
export function groupUnplaced(unplaced: UnplacedPiece[]): UnplacedLine[] {
  const lines: UnplacedLine[] = [];
  for (const piece of [...unplaced].sort((a, b) => a.number - b.number)) {
    const line = lines.find(
      (l) => l.name === piece.name && l.section === piece.section && l.materialName === piece.materialName,
    );
    if (line) {
      line.count += 1;
      line.numbers.push(piece.number);
    } else {
      lines.push({ name: piece.name, section: piece.section, materialName: piece.materialName, count: 1, numbers: [piece.number] });
    }
  }
  return lines;
}

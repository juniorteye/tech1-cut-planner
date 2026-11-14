import type { DisplayUnit, Mm } from "./types.ts";
import { parseLength } from "./units.ts";

export type PastedLine =
  | { line: number; text: string; ok: true; widthMm: Mm; lengthMm: Mm; quantity: number; name: string }
  | { line: number; text: string; ok: false; reason: string };

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
// 35 x 260 - 6 pcs · 35x260-6 · 35 × 260 – 6 · 35*260 6pcs · 35 x 260 = 6 nos · 35 x 260 (qty 1) · 35 x 260 - 6 pcs side
const LINE = new RegExp(
  String.raw`^${NUMBER}\s*[x×X*]\s*${NUMBER}\s*(?:(?:[-–—=:]|\bx\b)?\s*${NUMBER}\s*(?:pcs?|pieces?|nos?|no\.?|x)?\.?)?\s*(.*)$`,
  "i",
);

/**
 * Reads a cut list pasted the way he writes it, one part per line: width ×
 * length – quantity. Sizes are in the workshop's unit. Blank lines are
 * ignored; anything else that cannot be read comes back marked, never dropped.
 */
export function parsePastedList(text: string, unit: DisplayUnit): PastedLine[] {
  return text.split(/\r?\n/).flatMap((raw, index): PastedLine[] => {
    const lineText = raw.trim().replace(/^[•*\-–]\s+/, "");
    if (!lineText) return [];
    const line = index + 1;
    const match = lineText.match(LINE);
    if (!match) return [{ line, text: raw.trim(), ok: false, reason: "No sizes like 35 x 260 found" }];
    const [, first, second, qty, rest] = match;
    const widthMm = parseLength(first.replace(",", "."), unit);
    const lengthMm = parseLength(second.replace(",", "."), unit);
    const quantity = qty === undefined ? 1 : Number(qty);
    if (widthMm === null || lengthMm === null) return [{ line, text: raw.trim(), ok: false, reason: "A size is not a number" }];
    if (!Number.isInteger(quantity) || quantity < 1) return [{ line, text: raw.trim(), ok: false, reason: "The quantity must be a whole number" }];
    return [{ line, text: raw.trim(), ok: true, widthMm, lengthMm, quantity, name: rest.trim().replace(/^[-–—:]\s*/, "") }];
  });
}

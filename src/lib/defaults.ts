import type { BoardType, Mm } from "./types";

/**
 * The workshop sizes boards at 30.25 cm to the foot, so these are the sizes
 * the client works with, not the exact foot conversion.
 * 8 × 4 ft: 8 × 30.25 = 242 cm by 4 × 30.25 = 121 cm.
 */
export const STANDARD_SHEET = { lengthMm: 2420, widthMm: 1210 };

/**
 * 9 × 7 ft as the client's supplier sells it: 282 × 212 cm, confirmed by the
 * client. It is not 9 × 30.25 cm, so it is written out, not worked out.
 */
export const LARGE_SHEET = { lengthMm: 2820, widthMm: 2120 };

/** Lengths the market sells planks in, in feet. */
export const PLANK_LENGTHS_FT = [8, 10, 12, 14, 16];

export const DEFAULT_MIN_LEFTOVER_SHORT_SIDE_MM: Mm = 100;
export const DEFAULT_MIN_LEFTOVER_AREA_MM2 = 90_000;
export const DEFAULT_MIN_LEFTOVER_LENGTH_MM: Mm = 300;

export const DEFAULT_EDGE_TRIM_MM: Record<BoardType, Mm> = {
  plywood: 0,
  mdf: 0,
  chipboard: 10,
  melamine: 10,
};

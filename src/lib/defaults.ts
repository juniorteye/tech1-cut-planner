import type { BoardType, Mm } from "./types";

/** Market sheet labels map to the real sheet, not the exact foot conversion. */
export const STANDARD_SHEET = { lengthMm: 2440, widthMm: 1220 };

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

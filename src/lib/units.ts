import type { DisplayUnit, Mm, Pesewas } from "./types";

const MM_PER_INCH = 25.4;

/**
 * Reads what people actually type: 720, 720mm, 8ft, 2' 3 1/2", 27 1/2in.
 * A bare number follows the workshop's unit, so 27 means inches in ft-in mode
 * and 210 means 210 cm in cm mode.
 */
export function parseLength(text: string, unit: DisplayUnit): Mm | null {
  const value = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return null;

  const metric = value.match(/^(\d+(?:\.\d+)?) ?(mm)?$/);
  if (metric && (metric[2] || unit === "mm")) {
    return positive(Number(metric[1]));
  }
  if (metric && unit === "cm") {
    return positive(Number(metric[1]) * 10);
  }
  const centimetres = value.match(/^(\d+(?:\.\d+)?) ?cm$/);
  if (centimetres) {
    return positive(Number(centimetres[1]) * 10);
  }

  const imperial = value.match(
    /^(?:(\d+(?:\.\d+)?) ?(?:'|ft|feet|foot) ?)?(?:(\d+(?:\.\d+)?)? ?(?:(\d+)\/(\d+))? ?(?:"|in|inch|inches)?)?$/,
  );
  if (!imperial) return null;

  const [, feet, inches, top, bottom] = imperial;
  if (bottom === "0" || (!feet && !inches && !top)) return null;
  const totalInches =
    Number(feet ?? 0) * 12 + Number(inches ?? 0) + (top ? Number(top) / Number(bottom) : 0);
  return positive(totalInches * MM_PER_INCH);
}

/** Rounded to what the database stores, so a saved size matches a freshly parsed one. */
function positive(mm: number) {
  const rounded = Math.round(mm * 10_000) / 10_000;
  return rounded > 0 ? rounded : null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Centimetres to one decimal, which is how the workshop writes them: 206.4. */
function cm(mm: Mm) {
  return Math.round(mm) / 10;
}

export function formatLength(mm: Mm, unit: DisplayUnit) {
  if (unit === "mm") {
    return `${Math.round(mm * 10) / 10} mm`;
  }
  if (unit === "cm") {
    return `${cm(mm)} cm`;
  }

  const sixteenths = Math.round((mm / MM_PER_INCH) * 16);
  const feet = Math.floor(sixteenths / (12 * 16));
  const inches = Math.floor((sixteenths % (12 * 16)) / 16);
  const rest = sixteenths % 16;
  const divisor = rest ? gcd(rest, 16) : 1;
  const fraction = rest ? ` ${rest / divisor}/${16 / divisor}` : "";

  if (feet === 0) return inches === 0 && rest ? `${fraction.trim()}"` : `${inches}${fraction}"`;
  return `${feet}' ${inches}${fraction}"`;
}

export function formatSize(lengthMm: Mm, widthMm: Mm | null, unit: DisplayUnit) {
  if (widthMm === null) return formatLength(lengthMm, unit);
  if (unit === "mm") {
    return `${Math.round(lengthMm * 10) / 10} × ${Math.round(widthMm * 10) / 10} mm`;
  }
  if (unit === "cm") {
    return `${cm(lengthMm)} × ${cm(widthMm)} cm`;
  }
  return `${formatLength(lengthMm, unit)} × ${formatLength(widthMm, unit)}`;
}

export function formatMoney(pesewas: Pesewas) {
  const cedis = (pesewas / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `GH¢ ${cedis}`;
}

export function parseMoney(text: string): Pesewas | null {
  const value = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

/** Edge banding is bought by the metre. */
export function formatMetres(mm: Mm) {
  return `${(mm / 1000).toFixed(2)} m`;
}

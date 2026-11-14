"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { getMaterials, getWorkshop } from "@/lib/data";
import { suggestBandingColour } from "@/lib/planner/banding";
import {
  DEFAULT_EDGE_TRIM_MM,
  DEFAULT_MIN_LEFTOVER_AREA_MM2,
  DEFAULT_MIN_LEFTOVER_LENGTH_MM,
  DEFAULT_MIN_LEFTOVER_SHORT_SIDE_MM,
  LARGE_SHEET,
  PLANK_LENGTHS_FT,
  STANDARD_SHEET,
} from "@/lib/defaults";
import { createClient } from "@/lib/supabase/server";
import type { Board, BoardType } from "@/lib/types";
import { parseLength, parseMoney } from "@/lib/units";

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function saved(): ActionResult {
  revalidatePath("/setup");
  return { savedAt: Date.now() };
}

export async function saveWorkshop(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const kerf = parseLength(text(data, "kerf"), "mm");

  if (!text(data, "name")) return { error: "Enter your workshop name." };
  if (kerf === null) return { error: "Enter the blade cut thickness in mm, for example 3." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("workshops")
    .update({ name: text(data, "name"), kerf_mm: kerf, display_unit: text(data, "unit") })
    .eq("id", workshop.id);

  return error ? { error: "Could not save. Please try again." } : saved();
}

export async function saveBoard(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const id = text(data, "id");
  const boardType = text(data, "boardType") as BoardType;
  const size = text(data, "size");
  const preset = size === "large" ? LARGE_SHEET : size === "other" ? null : STANDARD_SHEET;
  const lengthMm = preset ? preset.lengthMm : parseLength(text(data, "length"), "mm");
  const widthMm = preset ? preset.widthMm : parseLength(text(data, "width"), "mm");
  const thicknessMm = parseLength(text(data, "thickness"), "mm");
  const price = parseMoney(text(data, "price"));
  const trimText = text(data, "trim");
  const trim = trimText === "" ? DEFAULT_EDGE_TRIM_MM[boardType] : Number(trimText);
  const shortSide = Number(text(data, "minShortSide") || DEFAULT_MIN_LEFTOVER_SHORT_SIDE_MM);
  const areaM2 = text(data, "minArea");
  const area = areaM2 ? Number(areaM2) * 1_000_000 : DEFAULT_MIN_LEFTOVER_AREA_MM2;

  if (!text(data, "name")) return { error: "Give this board a name, for example Plywood 18 mm." };
  if (lengthMm === null || widthMm === null) return { error: "Enter the sheet length and width." };
  if (thicknessMm === null) return { error: "Enter the thickness, for example 18." };
  if (price === null) return { error: "Enter the price per sheet in GH¢." };
  if (!(trim >= 0) || !(shortSide >= 0) || !(area >= 0)) {
    return { error: "Edge trim and offcut sizes must be numbers." };
  }
  if (trim * 2 >= Math.min(lengthMm, widthMm)) return { error: "That edge trim is bigger than the sheet." };

  // Left blank, the tape is the one a matching board already uses, or else the board's own name.
  const others = (await getMaterials()).filter((m): m is Board => m.kind === "board" && m.id !== id);
  const bandingColour = text(data, "bandingColour") || suggestBandingColour(text(data, "name"), others) || text(data, "name");

  const row = {
    workshop_id: workshop.id,
    kind: "board",
    name: text(data, "name"),
    board_type: boardType,
    length_mm: lengthMm,
    width_mm: widthMm,
    thickness_mm: thicknessMm,
    price_per_sheet: price,
    edge_trim_mm: trim,
    min_leftover_short_side_mm: shortSide,
    min_leftover_area_mm2: area,
    banding_colour: bandingColour,
    no_banding: data.get("noBanding") === "on",
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("materials").update(row).eq("id", id)
    : await supabase.from("materials").insert(row);

  return error ? { error: "Could not save this board." } : saved();
}

export async function saveTimber(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const id = text(data, "id");
  const minLength = Number(text(data, "minLength") || DEFAULT_MIN_LEFTOVER_LENGTH_MM);

  const lengths = [];
  for (const feet of PLANK_LENGTHS_FT) {
    const priceText = text(data, `price${feet}`);
    if (!priceText) continue;
    const price = parseMoney(priceText);
    if (price === null) return { error: `Check the price for ${feet} ft.` };
    lengths.push({ length_mm: parseLength(`${feet}ft`, "mm"), price_per_piece: price });
  }

  if (!text(data, "name")) return { error: "Give this timber a name, for example 2 × 4." };
  if (lengths.length === 0) return { error: "Enter a price for at least one length." };
  if (!(minLength >= 0)) return { error: "The smallest offcut must be a number." };

  const row = {
    workshop_id: workshop.id,
    kind: "timber",
    name: text(data, "name"),
    min_leftover_length_mm: minLength,
  };

  const supabase = await createClient();
  const result = id
    ? await supabase.from("materials").update(row).eq("id", id).select("id").single()
    : await supabase.from("materials").insert(row).select("id").single();

  if (result.error) return { error: "Could not save this timber." };

  const materialId = result.data.id;
  await supabase.from("timber_lengths").delete().eq("material_id", materialId);
  const { error } = await supabase
    .from("timber_lengths")
    .insert(lengths.map((length) => ({ ...length, workshop_id: workshop.id, material_id: materialId })));

  return error ? { error: "Could not save the plank prices." } : saved();
}

export async function deleteMaterial(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("materials").delete().eq("id", text(data, "id"));

  return error ? { error: "This material is used by a job, so it can't be removed." } : saved();
}

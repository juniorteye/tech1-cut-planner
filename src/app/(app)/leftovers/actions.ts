"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { getMaterials, getWorkshop } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { parseLength } from "@/lib/units";

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function saved(): ActionResult {
  revalidatePath("/leftovers");
  return { savedAt: Date.now() };
}

export async function addLeftover(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const materials = await getMaterials();
  const material = materials.find((entry) => entry.id === text(data, "materialId"));
  const lengthMm = parseLength(text(data, "length"), workshop.displayUnit);
  const widthMm = parseLength(text(data, "width"), workshop.displayUnit);

  if (!material) return { error: "Choose a material." };
  if (lengthMm === null) return { error: "Check the length." };
  if (material.kind === "board" && widthMm === null) return { error: "Check the width." };

  const value =
    material.kind === "board"
      ? Math.round(((lengthMm * widthMm!) / (material.lengthMm * material.widthMm)) * material.pricePerSheet)
      : Math.round(
          (material.lengths.length > 0
            ? Math.max(...material.lengths.map((l) => l.pricePerPiece / l.lengthMm))
            : 0) * lengthMm,
        );

  const supabase = await createClient();
  const { error } = await supabase.from("leftovers").insert({
    workshop_id: workshop.id,
    material_id: material.id,
    length_mm: lengthMm,
    width_mm: material.kind === "board" ? widthMm : null,
    value,
  });

  return error ? { error: "Could not add the leftover." } : saved();
}

export async function updateLeftover(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const lengthMm = parseLength(text(data, "length"), workshop.displayUnit);
  const widthText = text(data, "width");
  const widthMm = widthText ? parseLength(widthText, workshop.displayUnit) : null;

  if (lengthMm === null || (widthText && widthMm === null)) return { error: "Check the size." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leftovers")
    .update({ length_mm: lengthMm, width_mm: widthMm })
    .eq("id", text(data, "id"))
    .eq("status", "available");

  return error ? { error: "Could not save the size." } : saved();
}

export async function setLeftoverStatus(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leftovers")
    .update({ status: text(data, "status") })
    .eq("id", text(data, "id"))
    .in("status", ["available", "damaged"]);

  return error ? { error: "Could not update this leftover." } : saved();
}

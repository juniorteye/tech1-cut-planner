"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { getJob, getLeftovers, getMaterials, getPieces, getWorkshop } from "@/lib/data";
import { planJob } from "@/lib/planner/plan-job";
import { createClient } from "@/lib/supabase/server";
import { parseLength } from "@/lib/units";

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

export async function createJob(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const name = text(data, "name");

  if (!name) return { error: "Give the job a name." };

  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .insert({ workshop_id: workshop.id, name, customer: text(data, "customer") })
    .select("id")
    .single();

  if (error) return { error: "Could not create the job." };
  redirect(`/jobs/${job.id}`);
}

export async function copyJob(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const source = await getJob(text(data, "id"));

  if (!source) return { error: "That job no longer exists." };

  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      workshop_id: workshop.id,
      name: `${source.name} (copy)`,
      customer: source.customer,
      quote_mode: source.quoteMode,
      waste_allowance_percent: source.wasteAllowancePercent,
      copied_from_job_id: source.id,
    })
    .select("id")
    .single();

  if (error) return { error: "Could not copy the job." };

  const pieces = await getPieces(source.id);
  if (pieces.length > 0) {
    const { error: piecesError } = await supabase.from("pieces").insert(
      pieces.map((piece) => ({
        workshop_id: workshop.id,
        job_id: job.id,
        material_id: piece.materialId,
        name: piece.name,
        length_mm: piece.lengthMm,
        width_mm: piece.widthMm,
        quantity: piece.quantity,
        grain_locked: piece.grainLocked,
        banded_lengths: piece.bandedLengths,
        banded_widths: piece.bandedWidths,
      })),
    );
    if (piecesError) return { error: "The job was copied, but its pieces were not." };
  }

  redirect(`/jobs/${job.id}`);
}

/** Only drafts can go: accepted and cut jobs hold offcuts and an agreed price. */
export async function deleteJob(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const id = text(data, "id");
  const supabase = await createClient();
  const { data: deleted, error } = await supabase.from("jobs").delete().eq("id", id).eq("status", "draft").select("id");

  if (error) return { error: "Could not delete the job." };
  // Nothing deleted: either someone else already deleted it, which is fine, or
  // someone accepted it in the meantime.
  if (deleted.length === 0 && (await getJob(id))) {
    return { error: "This job has just been accepted, so it can no longer be deleted." };
  }
  revalidatePath("/");
  return { savedAt: Date.now() };
}

export async function saveQuoteSettings(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const id = text(data, "jobId");
  const allowance = Number(text(data, "allowance") || 0);

  if (!(allowance >= 0)) return { error: "The waste allowance must be a number." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ quote_mode: text(data, "quoteMode"), waste_allowance_percent: allowance })
    .eq("id", id);

  if (error) return { error: "Could not save the quote setting." };
  revalidatePath(`/jobs/${id}`);
  return { savedAt: Date.now() };
}

export async function addPiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const jobId = text(data, "jobId");
  const materialId = text(data, "materialId");
  const materials = await getMaterials();
  const material = materials.find((entry) => entry.id === materialId);
  const lengthMm = parseLength(text(data, "length"), workshop.displayUnit);
  const widthMm = parseLength(text(data, "width"), workshop.displayUnit);
  const quantity = Number(text(data, "quantity") || 1);
  const bandedLengths = Number(text(data, "bandedLengths") || 0);
  const bandedWidths = Number(text(data, "bandedWidths") || 0);
  const edgeCounts = [0, 1, 2];

  if (!material) return { error: "Choose a board." };
  if (lengthMm === null) return { error: `Check the length. Try 720 or 2' 4".` };
  if (material.kind === "board" && widthMm === null) return { error: `Check the width. Try 560 or 1' 10".` };
  if (!Number.isInteger(quantity) || quantity < 1) return { error: "How many must be a whole number." };
  if (!edgeCounts.includes(bandedLengths) || !edgeCounts.includes(bandedWidths)) {
    return { error: "Tap the edges again to mark the banding." };
  }

  const supabase = await createClient();
  // A name is optional: the sketch only has sizes, so an unnamed part is numbered by its line.
  const { count } = await supabase.from("pieces").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const isBoard = material.kind === "board";
  const { error } = await supabase.from("pieces").insert({
    workshop_id: workshop.id,
    job_id: jobId,
    material_id: materialId,
    name: text(data, "name") || `Part ${(count ?? 0) + 1}`,
    length_mm: lengthMm,
    width_mm: isBoard ? widthMm : null,
    quantity,
    grain_locked: data.get("grainLocked") === "on",
    banded_lengths: isBoard ? bandedLengths : 0,
    banded_widths: isBoard ? bandedWidths : 0,
  });

  if (error) return { error: "Could not add the piece." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

export async function deletePiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("pieces").delete().eq("id", text(data, "id"));

  if (error) return { error: "Could not remove the piece." };
  revalidatePath(`/jobs/${text(data, "jobId")}`);
  return { savedAt: Date.now() };
}

export async function acceptPlan(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const [workshop, pieces, materials, leftovers] = await Promise.all([
    getWorkshop(),
    getPieces(jobId),
    getMaterials(),
    getLeftovers(),
  ]);

  // Planned again here so the saved plan always matches current stock and prices.
  const plan = planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm });
  if (plan.unplaced.length > 0) {
    return { error: "Some pieces do not fit. Change them before accepting." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_job", { target_job: jobId, job_plan: plan });

  if (error?.message === "leftover_taken") {
    return { error: "A leftover in this plan was just taken by another job. Please plan again." };
  }
  if (error) return { error: "Could not accept the plan." };

  revalidatePath(`/jobs/${jobId}`, "layout");
  redirect(`/jobs/${jobId}/cut-sheet`);
}

async function runStockStep(fn: string, jobId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { target_job: jobId });

  if (error?.message.startsWith("offcut_in_use:")) {
    const name = error.message.slice("offcut_in_use:".length);
    return { error: `An offcut from this job has gone into ${name}. Undo or change that first.` };
  }
  if (error) return { error: "That did not work. Refresh the page and try again." };

  revalidatePath("/", "layout");
  return { savedAt: Date.now() };
}

export async function reopenJob(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const result = await runStockStep("reopen_job", jobId);
  if (result.error) return result;
  redirect(`/jobs/${jobId}`);
}

export async function markJobCut(_state: ActionResult, data: FormData) {
  return runStockStep("mark_job_cut", text(data, "jobId"));
}

export async function undoJobCut(_state: ActionResult, data: FormData) {
  return runStockStep("undo_job_cut", text(data, "jobId"));
}

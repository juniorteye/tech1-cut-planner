"use server";

import { revalidatePath } from "next/cache";
import { takesBanding } from "@/lib/planner/banding";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { getJob, getLeftovers, getMaterials, getPieces, getSections, getWorkshop } from "@/lib/data";
import { planJob } from "@/lib/planner/plan-job";
import { createClient } from "@/lib/supabase/server";
import { splitInTwo } from "@/lib/planner/split";
import type { DisplayUnit, Material } from "@/lib/types";
import { parseLength } from "@/lib/units";

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

/**
 * Only a draft can be changed. A page left open in another tab may still show
 * the forms after the plan was accepted, so every change checks again here.
 */
async function lockedError(jobId: string): Promise<ActionResult | null> {
  const job = await getJob(jobId);
  if (!job) return { error: "That job no longer exists." };
  return job.status === "draft" ? null : { error: "This plan has been accepted, so the job is locked. Refresh the page." };
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

  // The first section comes with the job, so a simple job is one list as before. If the
  // form was sent before its board list arrived, it goes on the first board, as the list would show.
  const materials = await getMaterials();
  const material =
    materials.find((entry) => entry.id === text(data, "materialId")) ??
    materials.find((entry) => entry.kind === "board") ??
    materials[0];
  if (material) {
    await supabase.from("sections").insert({
      workshop_id: workshop.id,
      job_id: job.id,
      name: text(data, "sectionName") || material.name,
      material_id: material.id,
      position: 0,
    });
  }
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
      sets: source.sets,
    })
    .select("id")
    .single();

  if (error) return { error: "Could not copy the job." };

  const [pieces, sections] = await Promise.all([getPieces(source.id), getSections(source.id)]);
  const newSection = new Map<string, string>();
  if (sections.length > 0) {
    const { data: copied, error: sectionsError } = await supabase
      .from("sections")
      .insert(
        sections.map((section) => ({
          workshop_id: workshop.id,
          job_id: job.id,
          name: section.name,
          material_id: section.materialId,
          position: section.position,
        })),
      )
      .select("id, position");
    if (sectionsError) return { error: "The job was copied, but its sections were not." };
    // Rows come back in the order they were sent.
    sections.forEach((section, index) => newSection.set(section.id, copied[index].id));
  }
  if (pieces.length > 0) {
    const { error: piecesError } = await supabase.from("pieces").insert(
      pieces.map((piece) => ({
        workshop_id: workshop.id,
        job_id: job.id,
        section_id: piece.sectionId ? (newSection.get(piece.sectionId) ?? null) : null,
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
  const locked = await lockedError(id);
  if (locked) return locked;
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

const NOTE_LIMIT = 200;
const EDGE_COUNTS = [0, 1, 2];

/** The checks Add and Edit share. The material is the part's own pick, else its section's board. */
function readPiece(data: FormData, unit: DisplayUnit, materials: Material[], sectionMaterialId: string) {
  const material = materials.find((entry) => entry.id === (text(data, "materialId") || sectionMaterialId));
  const lengthMm = parseLength(text(data, "length"), unit);
  const widthMm = parseLength(text(data, "width"), unit);
  const quantity = Number(text(data, "quantity") || 1);
  const bandedLengths = Number(text(data, "bandedLengths") || 0);
  const bandedWidths = Number(text(data, "bandedWidths") || 0);
  const note = text(data, "note");

  if (!material) return { error: "Choose a board." } as const;
  if (lengthMm === null) return { error: `Check the length. Try 720 or 2' 4".` } as const;
  if (material.kind === "board" && widthMm === null) return { error: `Check the width. Try 560 or 1' 10".` } as const;
  if (!Number.isInteger(quantity) || quantity < 1) return { error: "How many must be a whole number." } as const;
  if (!EDGE_COUNTS.includes(bandedLengths) || !EDGE_COUNTS.includes(bandedWidths)) {
    return { error: "Tap the edges again to mark the banding." } as const;
  }
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` } as const;

  const banded = takesBanding(material);
  return {
    row: {
      material_id: material.id,
      length_mm: lengthMm,
      width_mm: material.kind === "board" ? widthMm : null,
      quantity,
      grain_locked: data.get("grainLocked") === "on",
      banded_lengths: banded ? bandedLengths : 0,
      banded_widths: banded ? bandedWidths : 0,
      note,
    },
  } as const;
}

/**
 * Parts are listed in the order they were added. Rows saved in one go would
 * share a timestamp and come back in any order, so each gets its own, a
 * millisecond apart.
 */
function inOrder<T>(rows: T[]) {
  const start = Date.now();
  return rows.map((row, index) => ({ ...row, created_at: new Date(start + index).toISOString() }));
}

async function nextPartNumber(jobId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("pieces").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  return (count ?? 0) + 1;
}

export async function addPiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const [materials, sections] = await Promise.all([getMaterials(), getSections(jobId)]);
  const section = sections.find((entry) => entry.id === text(data, "sectionId"));
  if (!section) return { error: "This section no longer exists. Refresh the page." };

  const read = readPiece(data, workshop.displayUnit, materials, section.materialId);
  if ("error" in read) return { error: read.error };

  const supabase = await createClient();
  // A name is optional: the sketch only has sizes, so an unnamed part is numbered by its line.
  const { error } = await supabase.from("pieces").insert({
    ...read.row,
    workshop_id: workshop.id,
    job_id: jobId,
    section_id: section.id,
    name: text(data, "name") || `Part ${await nextPartNumber(jobId)}`,
  });

  if (error) return { error: "Could not add the piece." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

export async function updatePiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const [materials, sections, pieces] = await Promise.all([getMaterials(), getSections(jobId), getPieces(jobId)]);
  const piece = pieces.find((entry) => entry.id === text(data, "id"));
  if (!piece) return { error: "This part no longer exists. Refresh the page." };
  const sectionBoard = sections.find((entry) => entry.id === piece.sectionId)?.materialId ?? piece.materialId;

  const read = readPiece(data, workshop.displayUnit, materials, sectionBoard);
  if ("error" in read) return { error: read.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pieces")
    .update({ ...read.row, name: text(data, "name") || piece.name })
    .eq("id", piece.id)
    .eq("job_id", jobId);

  if (error) return { error: "Could not save the part." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

/** A part too long for every board becomes two halves to be joined, with the same banding in total. */
export async function splitPiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const piece = (await getPieces(jobId)).find((entry) => entry.id === text(data, "id"));
  if (!piece) return { error: "This part no longer exists. Refresh the page." };

  const halves = splitInTwo(piece).map((half) => ({
    workshop_id: half.workshopId,
    job_id: jobId,
    section_id: half.sectionId,
    material_id: half.materialId,
    name: half.name,
    length_mm: half.lengthMm,
    width_mm: half.widthMm,
    quantity: half.quantity,
    grain_locked: half.grainLocked,
    banded_lengths: half.bandedLengths,
    banded_widths: half.bandedWidths,
    note: half.note,
  }));

  const supabase = await createClient();
  // The halves go in before the whole part comes out, so a failure never loses it.
  const { error } = await supabase.from("pieces").insert(inOrder(halves));
  if (error) return { error: "Could not split the part." };
  const { error: removeError } = await supabase.from("pieces").delete().eq("id", piece.id).eq("job_id", jobId);
  if (removeError) {
    return { error: "The halves were added, but the whole part is still listed. Remove it by hand." };
  }
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

/** "Too long for 242 × 121 cm. Use 272 × 212 cm?": moves one part to another board of the same kind. */
export async function movePieceToBoard(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const [materials, pieces] = await Promise.all([getMaterials(), getPieces(jobId)]);
  const piece = pieces.find((entry) => entry.id === text(data, "id"));
  const from = materials.find((entry) => entry.id === piece?.materialId);
  const to = materials.find((entry) => entry.id === text(data, "materialId"));
  if (!piece || !from) return { error: "This part no longer exists. Refresh the page." };
  if (!to || to.kind !== from.kind) return { error: "Pick a board of the same kind." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pieces")
    .update({
      material_id: to.id,
      // A back panel takes no banding, so marks do not follow a part onto one.
      ...(!takesBanding(to) && { banded_lengths: 0, banded_widths: 0 }),
    })
    .eq("id", piece.id)
    .eq("job_id", jobId);

  if (error) return { error: "Could not move the part." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

/** Adds every line of a pasted list to a section, on the section's board. */
export async function addPastedPieces(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const [materials, sections] = await Promise.all([getMaterials(), getSections(jobId)]);
  const section = sections.find((entry) => entry.id === text(data, "sectionId"));
  if (!section) return { error: "This section no longer exists. Refresh the page." };
  const material = materials.find((entry) => entry.id === section.materialId);
  if (!material) return { error: "This section's board has been removed. Change the section first." };

  let rows: { widthMm: number; lengthMm: number; quantity: number; name: string; bandedLengths: number; bandedWidths: number }[];
  try {
    rows = JSON.parse(text(data, "rows"));
  } catch {
    return { error: "Read the list again, then add it." };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { error: "There are no parts to add." };
  const valid = rows.every(
    (row) =>
      row.lengthMm > 0 && row.widthMm > 0 && Number.isInteger(row.quantity) && row.quantity > 0 &&
      EDGE_COUNTS.includes(row.bandedLengths) && EDGE_COUNTS.includes(row.bandedWidths) &&
      typeof row.name === "string" && row.name.length <= 200,
  );
  if (!valid) return { error: "Some lines are not right. Read the list again." };

  const first = await nextPartNumber(jobId);
  const banded = takesBanding(material);
  const isBoard = material.kind === "board";
  const supabase = await createClient();
  const { error } = await supabase.from("pieces").insert(
    inOrder(rows.map((row, index) => ({
      workshop_id: workshop.id,
      job_id: jobId,
      section_id: section.id,
      material_id: material.id,
      name: row.name.trim() || `Part ${first + index}`,
      // Timber is cut to length, so the longer size is the length and there is no width.
      length_mm: isBoard ? row.lengthMm : Math.max(row.lengthMm, row.widthMm),
      width_mm: isBoard ? row.widthMm : null,
      quantity: row.quantity,
      grain_locked: false,
      banded_lengths: banded ? row.bandedLengths : 0,
      banded_widths: banded ? row.bandedWidths : 0,
    }))),
  );

  if (error) return { error: "Could not add the list." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

export async function deletePiece(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const locked = await lockedError(text(data, "jobId"));
  if (locked) return locked;
  const supabase = await createClient();
  const { error } = await supabase.from("pieces").delete().eq("id", text(data, "id")).eq("job_id", text(data, "jobId"));

  if (error) return { error: "Could not remove the piece." };
  revalidatePath(`/jobs/${text(data, "jobId")}`);
  return { savedAt: Date.now() };
}

export async function acceptPlan(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const [workshop, job, pieces, sections, materials, leftovers] = await Promise.all([
    getWorkshop(),
    getJob(jobId),
    getPieces(jobId),
    getSections(jobId),
    getMaterials(),
    getLeftovers(),
  ]);

  if (!job) return { error: "That job no longer exists." };
  // Planned again here so the saved plan always matches current stock and prices.
  const plan = planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm, sets: job.sets, sections });
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

export async function saveSets(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  // Blank is refused, not read as 1: the box is never empty unless something went wrong.
  const sets = text(data, "sets") === "" ? Number.NaN : Number(text(data, "sets"));

  if (!Number.isInteger(sets) || sets < 1 || sets > 999) return { error: "How many sets must be a whole number from 1." };

  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ sets }).eq("id", jobId).eq("status", "draft");

  if (error) return { error: "Could not save how many sets." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

async function boardFor(data: FormData) {
  const material = (await getMaterials()).find((entry) => entry.id === text(data, "materialId"));
  return material ?? null;
}

export async function addSection(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const workshop = await getWorkshop();
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const material = await boardFor(data);

  if (!material) return { error: "Choose the board for this section." };

  const sections = await getSections(jobId);
  const supabase = await createClient();
  const { error } = await supabase.from("sections").insert({
    workshop_id: workshop.id,
    job_id: jobId,
    name: text(data, "name") || material.name,
    material_id: material.id,
    position: sections.reduce((last, section) => Math.max(last, section.position + 1), 0),
  });

  if (error) return { error: "Could not add the section." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

export async function saveSection(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const id = text(data, "id");
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const material = await boardFor(data);

  if (!text(data, "name")) return { error: "Give the section a name, for example Miniyator." };
  if (!material) return { error: "Choose the board for this section." };

  const supabase = await createClient();
  const [sections, materials, pieces] = await Promise.all([getSections(jobId), getMaterials(), getPieces(jobId)]);
  const before = sections.find((section) => section.id === id);
  if (!before) return { error: "This section no longer exists. Refresh the page." };
  const oldKind = materials.find((entry) => entry.id === before.materialId)?.kind;
  const following = pieces.filter((piece) => piece.sectionId === id && piece.materialId === before.materialId);
  // Timber parts have no width, so they cannot simply become board parts, or the other way round.
  if (oldKind && oldKind !== material.kind && following.length > 0) {
    return { error: `This section's parts are ${oldKind === "board" ? "board" : "timber"} parts. Pick another ${oldKind}.` };
  }

  const { error } = await supabase
    .from("sections")
    .update({ name: text(data, "name"), material_id: material.id })
    .eq("id", id)
    .eq("job_id", jobId);
  if (error) return { error: "Could not save the section." };

  // Parts that followed the section's board move with it; parts given their own board keep it.
  if (before.materialId !== material.id) {
    const { error: piecesError } = await supabase
      .from("pieces")
      .update({ material_id: material.id })
      .eq("section_id", id)
      .eq("material_id", before.materialId);
    if (piecesError) return { error: "The section was renamed, but its parts kept the old board." };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

/** Removes the section and every part listed under it. */
export async function deleteSection(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const jobId = text(data, "jobId");
  const locked = await lockedError(jobId);
  if (locked) return locked;
  const supabase = await createClient();
  const { error } = await supabase.from("sections").delete().eq("id", text(data, "id")).eq("job_id", jobId);

  if (error) return { error: "Could not remove the section." };
  revalidatePath(`/jobs/${jobId}`);
  return { savedAt: Date.now() };
}

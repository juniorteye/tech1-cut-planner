import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { SetsBadge } from "@/components/sets-badge";
import { EdgeIcon } from "@/components/edge-icon";
import { OffcutNote } from "@/components/offcut-note";
import { getJob, getLeftovers, getMaterials, getPieces, getPlan, getSections, getWorkshop } from "@/lib/data";
import { bandingByColour, describeEdges, pieceBandingMm, takesBanding } from "@/lib/planner/banding";
import { countLabel, planGroups } from "@/lib/planner/plan-groups";
import { OTHER_PARTS, planJob } from "@/lib/planner/plan-job";
import type { JobPlan } from "@/lib/planner/types";
import type { DisplayUnit, Material, Piece, Section } from "@/lib/types";
import { formatMetres, formatSize } from "@/lib/units";
import {
  addPiece,
  addSection,
  deletePiece,
  deleteSection,
  saveQuoteSettings,
  saveSection,
  saveSets,
} from "../actions";
import { PieceFields } from "./piece-fields";

export default async function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const [workshop, job, pieces, sections, materials, leftovers, saved] = await Promise.all([
    getWorkshop(),
    getJob(jobId),
    getPieces(jobId),
    getSections(jobId),
    getMaterials(),
    getLeftovers(),
    getPlan(jobId),
  ]);

  if (!job) {
    notFound();
  }

  const unit = workshop.displayUnit;
  const editable = job.status === "draft";
  // Planned again on every change, so the totals follow each part as it is added.
  const plan =
    pieces.length === 0
      ? null
      : (saved ?? planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm, sets: job.sets, sections }));
  const known = new Set(sections.map((section) => section.id));
  // Parts added before sections existed, or by an older version of the app.
  const loose = pieces.filter((piece) => !piece.sectionId || !known.has(piece.sectionId));
  const shared = { materials, unit, editable, sets: job.sets, jobId: job.id };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{job.name}</h1>
          {job.customer && <p className="text-muted">{job.customer}</p>}
        </div>
        {editable ? (
          <ActionForm
            action={saveSets}
            submitLabel="Save sets"
            pendingLabel="Saving…"
            subtle
            className="flex items-end gap-2 [&_button]:min-h-10"
          >
            <input type="hidden" name="jobId" value={job.id} />
            <div className="w-28">
              <FormField label="How many sets" name="sets" type="number" min={1} max={999} defaultValue={job.sets} required />
            </div>
          </ActionForm>
        ) : (
          job.sets > 1 && <SetsBadge sets={job.sets} />
        )}
      </div>

      {!editable && (
        <p className="rounded-xl border border-line bg-keep p-4">
          This plan has been accepted, so the pieces are locked.{" "}
          <Link href={`/jobs/${job.id}/plan`} className="inline-flex min-h-10 items-center font-semibold underline">
            Open the plan
          </Link>
        </p>
      )}

      {editable && materials.length === 0 && (
        <p className="rounded-xl border border-line bg-card p-4">
          Add your materials first.{" "}
          <Link href="/setup" className="font-semibold underline">
            Go to Setup
          </Link>
        </p>
      )}

      {plan && <LiveTotals plan={plan} jobId={job.id} />}

      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          pieces={pieces.filter((piece) => piece.sectionId === section.id)}
          {...shared}
        />
      ))}

      {loose.length > 0 && (
        <Card title={OTHER_PARTS}>
          <p className="mb-2 text-sm text-muted">Added before this job had sections.</p>
          <PieceList pieces={loose} {...shared} />
        </Card>
      )}

      {editable && materials.length > 0 && (
        <Card title={sections.length === 0 ? "Add your first section" : undefined}>
          {sections.length === 0 ? (
            <SectionForm jobId={job.id} materials={materials} />
          ) : (
            <details>
              <summary className="cursor-pointer font-display text-xl font-bold">Add a section</summary>
              <p className="mt-1 text-sm text-muted">One section for each board, such as Miniyator, D-Grey or B-Panels.</p>
              <SectionForm jobId={job.id} materials={materials} />
            </details>
          )}
        </Card>
      )}

      {editable && (
        <Card title="How to price this job">
          <ActionForm action={saveQuoteSettings} submitLabel="Save" pendingLabel="Saving…">
            <input type="hidden" name="jobId" value={job.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Charge the customer for" name="quoteMode" defaultValue={job.quoteMode}>
                <option value="whole-sheets">Every whole sheet and plank</option>
                <option value="part-used">Only the part used</option>
              </SelectField>
              <FormField
                label="Waste allowance if part used (%)"
                name="allowance"
                inputMode="decimal"
                defaultValue={job.wasteAllowancePercent}
              />
            </div>
          </ActionForm>
        </Card>
      )}

      {pieces.length > 0 && (
        <ButtonLink href={`/jobs/${job.id}/plan`} className="block text-center text-lg">
          {editable ? "Plan my cuts" : "Open the plan"}
        </ButtonLink>
      )}
    </div>
  );
}

type Shared = { materials: Material[]; unit: DisplayUnit; editable: boolean; sets: number; jobId: string };

function SectionCard({ section, pieces, materials, unit, editable, sets, jobId }: Shared & { section: Section; pieces: Piece[] }) {
  const board = materials.find((material) => material.id === section.materialId);
  const parts = pieces.reduce((sum, piece) => sum + piece.quantity, 0);

  return (
    <section aria-label={section.name} className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-display text-2xl font-bold">{section.name}</h2>
        <p className="text-sm text-muted">
          {board?.name ?? "Board removed"} · {parts} {parts === 1 ? "part" : "parts"}
        </p>
      </div>

      {pieces.length === 0 ? (
        <p className="text-muted">No parts yet.</p>
      ) : (
        <PieceList pieces={pieces} materials={materials} unit={unit} editable={editable} sets={sets} jobId={jobId} />
      )}

      {editable && (
        <>
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="font-display text-xl font-bold">Add a piece</h3>
            <ActionForm action={addPiece} submitLabel="Add piece" pendingLabel="Adding…" resetOnSave>
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="sectionId" value={section.id} />
              <PieceFields materials={materials} unit={unit} defaultMaterialId={section.materialId} />
            </ActionForm>
          </div>
          <details className="mt-3">
            <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-muted">
              Change or remove this section
            </summary>
            <SectionForm jobId={jobId} materials={materials} section={section} />
            <ActionForm
              action={deleteSection}
              submitLabel={pieces.length > 0 ? `Remove section and its ${parts} ${parts === 1 ? "part" : "parts"}` : "Remove section"}
              pendingLabel="Removing…"
              subtle
              className="mt-2"
            >
              <input type="hidden" name="id" value={section.id} />
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
          </details>
        </>
      )}
    </section>
  );
}

function SectionForm({ jobId, materials, section }: { jobId: string; materials: Material[]; section?: Section }) {
  return (
    <ActionForm
      action={section ? saveSection : addSection}
      submitLabel={section ? "Save section" : "Add section"}
      pendingLabel={section ? "Saving…" : "Adding…"}
      resetOnSave={!section}
      className="mt-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      {section && <input type="hidden" name="id" value={section.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Section name"
          name="name"
          defaultValue={section?.name}
          placeholder="Miniyator"
          required={Boolean(section)}
        />
        <SelectField label="Board" name="materialId" defaultValue={section?.materialId}>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </SelectField>
      </div>
      {!section && <p className="mt-1 text-sm text-muted">Left blank, the section is named after its board.</p>}
    </ActionForm>
  );
}

function PieceList({ pieces, materials, unit, editable, sets, jobId }: Shared & { pieces: Piece[] }) {
  const material = (id: string) => materials.find((entry) => entry.id === id);

  return (
    <ul className="divide-y divide-line">
      {pieces.map((piece) => (
        <li key={piece.id} className="flex items-center gap-3 py-2">
          {takesBanding(material(piece.materialId)) && <EdgeIcon {...piece} />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {piece.quantity} × {piece.name}
            </p>
            <p className="text-sm text-muted">
              {formatSize(piece.lengthMm, piece.widthMm, unit)} · {material(piece.materialId)?.name ?? ""}
              {piece.grainLocked && " · grain locked"}
              {sets > 1 && ` · ${piece.quantity * sets} for ${sets} sets`}
            </p>
            {takesBanding(material(piece.materialId)) && (
              <p className="text-sm text-muted">
                Banding: {describeEdges(piece)}
                {pieceBandingMm(piece) > 0 && ` · ${formatMetres(pieceBandingMm(piece) * piece.quantity)}`}
              </p>
            )}
          </div>
          {editable && (
            <ActionForm action={deletePiece} submitLabel="Remove" pendingLabel="Removing…" subtle className="shrink-0">
              <input type="hidden" name="id" value={piece.id} />
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Stays in view while parts are entered: boards so far, banding per tape
 * colour, and a line per board type, all for every set.
 */
function LiveTotals({ plan, jobId }: { plan: JobPlan; jobId: string }) {
  const sheets = plan.buy.filter((item) => item.widthMm !== null).reduce((sum, item) => sum + item.count, 0);
  const planks = plan.buy.filter((item) => item.widthMm === null).reduce((sum, item) => sum + item.count, 0);
  const fromStore = [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover").length;
  const banding = bandingByColour(plan.banding);
  const groups = planGroups(plan);
  const sets = plan.sets ?? 1;

  return (
    <section
      aria-label="Totals so far"
      aria-live="polite"
      className="sticky top-0 z-10 -mx-4 border-b-4 border-ruler bg-paper/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="font-display text-3xl font-bold">{sheets}</span>{" "}
          <span className="text-sm text-muted">{sheets === 1 ? "board to buy" : "boards to buy"}</span>
        </p>
        {planks > 0 && (
          <p>
            <span className="font-display text-3xl font-bold">{planks}</span>{" "}
            <span className="text-sm text-muted">{planks === 1 ? "plank to buy" : "planks to buy"}</span>
          </p>
        )}
        {/* Tape is bought by colour, so each colour gets its own figure, never one combined number. */}
        {(banding.length > 0 ? banding : [{ colour: "", mm: 0 }]).map((line) => (
          <p key={line.colour}>
            <span className="font-display text-3xl font-bold">{formatMetres(line.mm)}</span>{" "}
            <span className="text-sm text-muted">
              edge banding{banding.length > 1 && <span className="font-semibold text-ink"> · {line.colour}</span>}
            </span>
          </p>
        ))}
        <p className="text-sm text-muted">
          {plan.pieceCount} {plan.pieceCount === 1 ? "part" : "parts"}
        </p>
        {sets > 1 && <SetsBadge sets={sets} className="self-center !py-0.5 !text-sm" />}
      </div>
      <ul className="flex flex-wrap gap-x-4 text-sm text-muted">
        {groups.map((group) => (
          <li key={group.materialId}>
            <span className="font-semibold text-ink">{group.materialName}:</span> {countLabel(group)}
            {group.kind === "board" && ` · ${formatMetres(group.bandingMm)} banding`}
          </li>
        ))}
      </ul>
      {fromStore > 0 && <OffcutNote count={fromStore} />}
      {plan.unplaced.length > 0 && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {plan.unplaced.length === 1 ? "1 part does not fit" : `${plan.unplaced.length} parts do not fit`} the board.{" "}
          <Link href={`/jobs/${jobId}/plan`} className="underline">
            See which
          </Link>
        </p>
      )}
    </section>
  );
}

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
import { fitAdvice, type FitAdvice } from "@/lib/planner/fit";
import { countLabel, planGroups } from "@/lib/planner/plan-groups";
import { groupUnplaced } from "@/lib/planner/unplaced";
import { OTHER_PARTS, planJob } from "@/lib/planner/plan-job";
import type { JobPlan } from "@/lib/planner/types";
import type { DisplayUnit, Material, Piece, Section } from "@/lib/types";
import { formatMetres, formatSize } from "@/lib/units";
import {
  addPiece,
  addSection,
  deletePiece,
  deleteSection,
  movePieceToBoard,
  splitPiece,
  saveQuoteSettings,
  saveSection,
} from "../actions";
import { PasteList } from "./paste-list";
import { PieceEditor } from "./piece-editor";
import { PieceFields } from "./piece-fields";
import { SetsForm } from "./sets-form";

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
          <SetsForm jobId={job.id} sets={job.sets} />
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

      {plan && <LiveTotals plan={plan} />}

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
            <summary className="inline-flex min-h-10 cursor-pointer items-center font-semibold">Paste a list</summary>
            <PasteList jobId={jobId} sectionId={section.id} unit={unit} banding={takesBanding(board)} />
          </details>
          <details className="mt-1">
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
      {pieces.map((piece) => {
        const own = material(piece.materialId);
        const advice = fitAdvice(piece, own, materials);
        return (
          <li key={piece.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
            {takesBanding(own) && <EdgeIcon {...piece} />}
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-semibold">
                {piece.quantity} × {piece.name}
              </p>
              <p className="text-sm text-muted">
                {formatSize(piece.lengthMm, piece.widthMm, unit)} · {own?.name ?? ""}
                {piece.grainLocked && " · grain locked"}
                {sets > 1 && ` · ${piece.quantity * sets} for ${sets} sets`}
              </p>
              {takesBanding(own) && (
                <p className="text-sm text-muted">
                  Banding: {describeEdges(piece)}
                  {pieceBandingMm(piece) > 0 && ` · ${formatMetres(pieceBandingMm(piece) * piece.quantity)}`}
                </p>
              )}
              {piece.note && <p className="text-sm font-semibold">Note: {piece.note}</p>}
            </div>
            {editable && (
              <PieceEditor piece={piece} materials={materials} unit={unit}>
                <ActionForm action={deletePiece} submitLabel="Remove" pendingLabel="Removing…" subtle className="shrink-0">
                  <input type="hidden" name="id" value={piece.id} />
                  <input type="hidden" name="jobId" value={jobId} />
                </ActionForm>
              </PieceEditor>
            )}
            {advice.kind !== "fits" && own && (
              <FitWarning piece={piece} own={own} advice={advice} unit={unit} editable={editable} jobId={jobId} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

const sheetSize = (m: Material, unit: DisplayUnit) =>
  m.kind === "board"
    ? formatSize(m.lengthMm, m.widthMm, unit)
    : `the longest ${m.name} (${formatSize(Math.max(...m.lengths.map((l) => l.lengthMm)), null, unit)})`;

/** On the row of a part that does not fit its board: the reason, and the one-tap fix. */
function FitWarning({
  piece,
  own,
  advice,
  unit,
  editable,
  jobId,
}: {
  piece: Piece;
  own: Material;
  advice: Exclude<FitAdvice, { kind: "fits" }>;
  unit: DisplayUnit;
  editable: boolean;
  jobId: string;
}) {
  const problem = `Too ${advice.reason} for ${sheetSize(own, unit)}.`;
  const split = (
    <ActionForm action={splitPiece} submitLabel="Split into 2 pieces" pendingLabel="Splitting…" className="[&_button]:mt-2">
      <input type="hidden" name="id" value={piece.id} />
      <input type="hidden" name="jobId" value={jobId} />
    </ActionForm>
  );
  // Too long but a bigger board takes it: he chooses between that board and a joint.
  // Too wide, halving the length would not help, so only the bigger board is offered.
  const canSplit = advice.reason === "long";
  return (
    <div role="alert" className="basis-full rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      {advice.kind === "switch" ? (
        <>
          <p className="font-semibold">
            {problem} Use {sheetSize(advice.to, unit)}
            {canSplit ? " or split it?" : "?"}
          </p>
          <p>
            It fits {advice.to.name}.
            {canSplit && " Or split it into 2 pieces to be joined: the same width and banding, half the length each."}
          </p>
          {editable && (
            <div className="flex flex-wrap items-start gap-x-2">
              <ActionForm
                action={movePieceToBoard}
                submitLabel={`Use ${sheetSize(advice.to, unit)}`}
                pendingLabel="Moving…"
                className="[&_button]:mt-2"
              >
                <input type="hidden" name="id" value={piece.id} />
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="materialId" value={advice.to.id} />
              </ActionForm>
              {canSplit && split}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="font-semibold">{problem} It fits no board in Setup, so it cannot be planned.</p>
          <p>Split it into 2 pieces to be joined: the same width and banding, half the length each.</p>
          {editable && split}
        </>
      )}
    </div>
  );
}

/**
 * Stays in view while parts are entered: boards so far, banding per tape
 * colour, and a line per board type, all for every set.
 */
function LiveTotals({ plan }: { plan: JobPlan }) {
  const sheets = plan.buy.filter((item) => item.widthMm !== null).reduce((sum, item) => sum + item.count, 0);
  const planks = plan.buy.filter((item) => item.widthMm === null).reduce((sum, item) => sum + item.count, 0);
  const fromStore = [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover").length;
  const banding = bandingByColour(plan.banding);
  const groups = planGroups(plan);
  const sets = plan.sets ?? 1;
  const stuck = groupUnplaced(plan.unplaced);
  const stuckBoards = new Set(stuck.map((line) => line.materialName));

  return (
    <section
      aria-label="Totals so far"
      aria-live="polite"
      className="sticky top-0 z-10 -mx-4 border-b-4 border-ruler bg-paper/95 px-4 py-2 backdrop-blur"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {/* A count that leaves parts out would be wrong, so none is shown until every part fits. */}
        {stuck.length > 0 ? (
          <p className="text-red-700">
            <span className="font-display text-3xl font-bold">Can&apos;t plan</span>{" "}
            <span className="text-sm font-semibold">
              {plan.unplaced.length === 1 ? "1 part doesn't fit" : `${plan.unplaced.length} parts don't fit`}
            </span>
          </p>
        ) : (
          <>
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
          </>
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
      {/* One board per line, so two boards never read as one ("3.29 m bandingPlywood…"). */}
      <ul aria-label="Per board" className="mt-1 space-y-0.5 text-sm text-muted">
        {groups.map((group) => (
          <li key={group.materialId} className="block">
            <span className="font-semibold text-ink">{group.materialName}:</span>{" "}
            {stuckBoards.has(group.materialName) ? (
              <span className="font-semibold text-red-700">can&apos;t plan</span>
            ) : (
              countLabel(group)
            )}
            {group.kind === "board" && ` · ${formatMetres(group.bandingMm)} banding`}
          </li>
        ))}
      </ul>
      {fromStore > 0 && <OffcutNote count={fromStore} />}
      {stuck.length > 0 && (
        <p role="alert" className="text-sm text-red-700">
          <span className="font-semibold">Doesn&apos;t fit any board: </span>
          {stuck.slice(0, 3).map((line, index) => (
            <span key={`${line.section}-${line.name}-${line.materialName}`}>
              {index > 0 && ", "}
              {line.count} × {line.name}
              {line.section && ` (${line.section})`}
            </span>
          ))}
          {stuck.length > 3 && ` and ${stuck.length - 3} more`}. Each says what to do on its row below.
        </p>
      )}
    </section>
  );
}

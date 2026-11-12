import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { EdgeIcon } from "@/components/edge-icon";
import { OffcutNote } from "@/components/offcut-note";
import { getJob, getLeftovers, getMaterials, getPieces, getPlan, getWorkshop } from "@/lib/data";
import { describeEdges, pieceBandingMm } from "@/lib/planner/banding";
import { planJob } from "@/lib/planner/plan-job";
import type { JobPlan } from "@/lib/planner/types";
import { formatMetres, formatSize } from "@/lib/units";
import { addPiece, deletePiece, saveQuoteSettings } from "../actions";
import { PieceFields } from "./piece-fields";

export default async function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const [workshop, job, pieces, materials, leftovers, saved] = await Promise.all([
    getWorkshop(),
    getJob(jobId),
    getPieces(jobId),
    getMaterials(),
    getLeftovers(),
    getPlan(jobId),
  ]);

  if (!job) {
    notFound();
  }

  const unit = workshop.displayUnit;
  const editable = job.status === "draft";
  const materialName = (id: string) => materials.find((material) => material.id === id)?.name ?? "";
  const material = (id: string) => materials.find((entry) => entry.id === id);
  // Planned again on every change, so the totals follow each part as it is added.
  const plan =
    pieces.length === 0 ? null : (saved ?? planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">{job.name}</h1>
        {job.customer && <p className="text-muted">{job.customer}</p>}
      </div>

      {!editable && (
        <p className="rounded-xl border border-line bg-keep p-4">
          This plan has been accepted, so the pieces are locked.{" "}
          <Link href={`/jobs/${job.id}/plan`} className="inline-flex min-h-10 items-center font-semibold underline">
            Open the plan
          </Link>
        </p>
      )}

      {plan && <LiveTotals plan={plan} jobId={job.id} />}

      <Card title="Pieces">
        {pieces.length === 0 ? (
          <p className="text-muted">No pieces yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pieces.map((piece) => (
              <li key={piece.id} className="flex items-center gap-3 py-2">
                {material(piece.materialId)?.kind === "board" && <EdgeIcon {...piece} />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {piece.quantity} × {piece.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatSize(piece.lengthMm, piece.widthMm, unit)} · {materialName(piece.materialId)}
                    {piece.grainLocked && " · grain locked"}
                  </p>
                  {material(piece.materialId)?.kind === "board" && (
                    <p className="text-sm text-muted">
                      Banding: {describeEdges(piece)}
                      {pieceBandingMm(piece) > 0 &&
                        ` · ${formatMetres(pieceBandingMm(piece) * piece.quantity)}`}
                    </p>
                  )}
                </div>
                {editable && (
                  <ActionForm action={deletePiece} submitLabel="Remove" subtle className="shrink-0">
                    <input type="hidden" name="id" value={piece.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable && materials.length === 0 && (
        <p className="rounded-xl border border-line bg-card p-4">
          Add your materials first.{" "}
          <Link href="/setup" className="font-semibold underline">
            Go to Setup
          </Link>
        </p>
      )}

      {editable && materials.length > 0 && (
        <Card title="Add a piece">
          <ActionForm action={addPiece} submitLabel="Add piece" resetOnSave>
            <input type="hidden" name="jobId" value={job.id} />
            <PieceFields materials={materials} unit={unit} defaultMaterialId={pieces.at(-1)?.materialId} />
          </ActionForm>
        </Card>
      )}

      {editable && (
        <Card title="How to price this job">
          <ActionForm action={saveQuoteSettings} submitLabel="Save">
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

/** Stays in view while parts are entered, the way the workshop asked: boards so far and banding so far. */
function LiveTotals({ plan, jobId }: { plan: JobPlan; jobId: string }) {
  const sheets = plan.buy.filter((item) => item.widthMm !== null).reduce((sum, item) => sum + item.count, 0);
  const planks = plan.buy.filter((item) => item.widthMm === null).reduce((sum, item) => sum + item.count, 0);
  const fromStore = [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover").length;
  const banding = plan.banding ?? [];
  const bandingMm = banding.reduce((sum, line) => sum + line.mm, 0);
  const boardNames = [...new Set(plan.buy.filter((item) => item.widthMm !== null).map((item) => item.name))];

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
        <p>
          <span className="font-display text-3xl font-bold">{formatMetres(bandingMm)}</span>{" "}
          <span className="text-sm text-muted">edge banding</span>
        </p>
        <p className="text-sm text-muted">
          {plan.pieceCount} {plan.pieceCount === 1 ? "part" : "parts"}
        </p>
      </div>
      <p className="text-sm text-muted">
        {boardNames.join(", ")}
        {banding.length > 1 && ` · banding: ${banding.map((line) => `${line.materialName} ${formatMetres(line.mm)}`).join(", ")}`}
      </p>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { getJob, getMaterials, getPieces, getWorkshop } from "@/lib/data";
import { formatSize } from "@/lib/units";
import { addPiece, deletePiece, saveQuoteSettings } from "../actions";
import { PieceFields } from "./piece-fields";

export default async function JobPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  const [workshop, job, pieces, materials] = await Promise.all([
    getWorkshop(),
    getJob(jobId),
    getPieces(jobId),
    getMaterials(),
  ]);

  if (!job) {
    notFound();
  }

  const unit = workshop.displayUnit;
  const editable = job.status === "draft";
  const materialName = (id: string) => materials.find((material) => material.id === id)?.name ?? "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">{job.name}</h1>
        {job.customer && <p className="text-muted">{job.customer}</p>}
      </div>

      {!editable && (
        <p className="rounded-xl border border-line bg-keep p-4">
          This plan has been accepted, so the pieces are locked.{" "}
          <Link href={`/jobs/${job.id}/plan`} className="font-semibold underline">
            Open the plan
          </Link>
        </p>
      )}

      <Card title="Pieces">
        {pieces.length === 0 ? (
          <p className="text-muted">No pieces yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pieces.map((piece) => (
              <li key={piece.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {piece.quantity} × {piece.name}
                  </p>
                  <p className="text-sm text-muted">
                    {formatSize(piece.lengthMm, piece.widthMm, unit)} · {materialName(piece.materialId)}
                    {piece.grainLocked && " · grain locked"}
                  </p>
                </div>
                {editable && (
                  <ActionForm action={deletePiece} submitLabel="Remove" subtle>
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
            <PieceFields materials={materials} unit={unit} />
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

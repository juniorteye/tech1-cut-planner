import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { PlanBoards } from "@/components/plan-boards";
import { getJob, getLeftovers, getMaterials, getPieces, getPlan, getWorkshop } from "@/lib/data";
import { planJob } from "@/lib/planner/plan-job";
import { quoteTotal } from "@/lib/planner/quote";
import { formatMoney, formatSize } from "@/lib/units";
import { acceptPlan, markJobCut, reopenJob, undoJobCut } from "../../actions";

function Stat({ value, label, className = "" }: { value: string; label: string; className?: string }) {
  return (
    <div className={`border-t-4 border-ruler pt-2 ${className}`}>
      <p className="whitespace-nowrap font-display text-3xl font-bold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function wasteLabel(percent: number | null) {
  return percent === null ? "–" : `${Math.round(percent)}%`;
}

export default async function PlanPage({ params }: PageProps<"/jobs/[jobId]/plan">) {
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
  if (pieces.length === 0) {
    redirect(`/jobs/${jobId}`);
  }

  // A draft is planned fresh every time and changes no stock. Only accepting saves it.
  const plan = saved ?? planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm });
  const unit = workshop.displayUnit;
  const sheets = plan.buy.filter((item) => item.widthMm !== null).reduce((sum, item) => sum + item.count, 0);
  const planks = plan.buy.filter((item) => item.widthMm === null).reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Your cutting plan</h1>
        <p className="text-muted">{job.name}</p>
      </div>

      {plan.unplaced.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="font-semibold text-red-800">These pieces do not fit your materials:</p>
          <ul className="mt-1 list-disc pl-5 text-red-800">
            {plan.unplaced.map((piece) => (
              <li key={piece.number}>
                {piece.name} ({piece.materialName})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value={String(sheets)} label={sheets === 1 ? "sheet to buy" : "sheets to buy"} />
        {planks > 0 ? (
          <Stat value={String(planks)} label={planks === 1 ? "plank to buy" : "planks to buy"} />
        ) : (
          <Stat value={String(plan.pieceCount)} label="pieces cut" />
        )}
        <Stat value={wasteLabel(plan.boardWastePercent ?? plan.plankWastePercent)} label="wood wasted" />
        {/* Full width on phones, so a large amount stays on one line. */}
        <Stat value={formatMoney(quoteTotal(plan, job))} label="material cost" className="col-span-2 sm:col-span-1" />
      </div>

      {plan.buy.length > 0 && (
        <p className="text-sm text-muted">
          Buy:{" "}
          {plan.buy
            .map((item) => `${item.count} of ${item.name} (${formatSize(item.lengthMm, item.widthMm, unit)})`)
            .join(", ")}
        </p>
      )}

      <PlanBoards plan={plan} unit={unit} />

      <div className="no-print flex flex-wrap items-center gap-2 [&_button]:mt-0">
        {job.status === "draft" && (
          <>
            <ButtonLink href={`/jobs/${jobId}`} className="bg-transparent ring-1 ring-line">
              Not yet: change pieces
            </ButtonLink>
            {plan.unplaced.length === 0 && (
              <ActionForm action={acceptPlan} submitLabel="Yes: accept this plan">
                <input type="hidden" name="jobId" value={jobId} />
              </ActionForm>
            )}
          </>
        )}
        {job.status === "accepted" && (
          <>
            <ButtonLink href={`/jobs/${jobId}/cut-sheet`}>Cut sheet</ButtonLink>
            <ButtonLink href={`/jobs/${jobId}/cost-summary`}>Cost summary</ButtonLink>
            <ActionForm action={markJobCut} submitLabel="Mark as cut">
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
            <ActionForm action={reopenJob} submitLabel="Change the plan" subtle>
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
          </>
        )}
        {job.status === "cut" && (
          <>
            <ButtonLink href={`/jobs/${jobId}/cut-sheet`}>Cut sheet</ButtonLink>
            <ButtonLink href={`/jobs/${jobId}/cost-summary`}>Cost summary</ButtonLink>
            <ActionForm action={undoJobCut} submitLabel="Undo cut" subtle>
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
          </>
        )}
      </div>

      <Link href="/" className="no-print inline-flex min-h-10 items-center text-sm font-semibold text-muted">
        Back to jobs
      </Link>
    </div>
  );
}

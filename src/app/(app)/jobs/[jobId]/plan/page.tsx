import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { PlanBoards } from "@/components/plan-boards";
import { SetsBadge } from "@/components/sets-badge";
import { getJob, getLeftovers, getMaterials, getPieces, getPlan, getSections, getWorkshop } from "@/lib/data";
import { bandingByColour } from "@/lib/planner/banding";
import { planNotes } from "@/lib/planner/notes";
import { planJob } from "@/lib/planner/plan-job";
import { shoppingList, shoppingText } from "@/lib/planner/shopping";
import { groupUnplaced } from "@/lib/planner/unplaced";
import { ShareButtons } from "@/components/share-buttons";
import { ShoppingCard } from "@/components/shopping-card";
import { quoteTotal } from "@/lib/planner/quote";
import { formatMetres, formatMoney, formatSize } from "@/lib/units";
import { acceptPlan, markJobCut, reopenJob, undoJobCut } from "../../actions";
import { OffcutNote } from "@/components/offcut-note";

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
  if (pieces.length === 0) {
    redirect(`/jobs/${jobId}`);
  }

  // A draft is planned fresh every time and changes no stock. Only accepting saves it.
  const plan = saved ?? planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm, sets: job.sets, sections });
  const sets = plan.sets ?? 1;
  const unit = workshop.displayUnit;
  const sheets = plan.buy.filter((item) => item.widthMm !== null).reduce((sum, item) => sum + item.count, 0);
  const planks = plan.buy.filter((item) => item.widthMm === null).reduce((sum, item) => sum + item.count, 0);
  const fromStore = [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover").length;
  const banding = bandingByColour(plan.banding);
  const stuck = groupUnplaced(plan.unplaced).map((line) => {
    const first = plan.unplaced.find((piece) => piece.number === line.numbers[0]);
    return { ...line, size: first?.lengthMm ? formatSize(first.lengthMm, first.widthMm ?? null, unit) : "" };
  });
  const shopping = shoppingList(plan, unit);
  const notes = planNotes(plan);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Your cutting plan</h1>
        <p className="text-muted">{job.name}</p>
        {sets > 1 && <SetsBadge sets={sets} className="mt-2" />}
      </div>

      {stuck.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-display text-2xl font-bold">Can&apos;t plan: some parts don&apos;t fit</p>
          <p className="text-sm">
            No board in Setup takes {stuck.length === 1 ? "this part" : "these parts"}, so the boards to buy and the cost
            would be wrong. Go back to the job: each one has a fix on its row.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {stuck.map((line) => (
              <li key={`${line.section}-${line.name}-${line.materialName}`}>
                <span className="font-semibold">
                  {line.count} × {line.name}
                </span>
                {line.size && ` · ${line.size}`} ({line.section ? `${line.section}, ` : ""}
                {line.materialName})
              </li>
            ))}
          </ul>
        </div>
      )}

      {stuck.length === 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={String(sheets)} label={sheets === 1 ? "board to buy" : "boards to buy"} />
          {planks > 0 ? (
            <Stat value={String(planks)} label={planks === 1 ? "plank to buy" : "planks to buy"} />
          ) : (
            <Stat value={String(plan.pieceCount)} label="pieces cut" />
          )}
          <Stat value={wasteLabel(plan.boardWastePercent ?? plan.plankWastePercent)} label="wood wasted" />
          {/* Full width on phones, so a large amount stays on one line. */}
          <Stat
            value={formatMoney(quoteTotal(plan, job))}
            label="material cost"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {/* One figure per tape colour: he buys banding by colour. */}
      {banding.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {banding.map((line) => (
            <Stat key={line.colour} value={formatMetres(line.mm)} label={`edge banding · ${line.colour}`} />
          ))}
        </div>
      )}

      {fromStore > 0 && <OffcutNote count={fromStore} />}

      {stuck.length === 0 && (
        <section aria-label="Shopping list" className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-bold">Shopping list</h2>
            <ButtonLink href={`/jobs/${jobId}/shopping-list`} className="no-print bg-transparent ring-1 ring-line">
              Print view
            </ButtonLink>
          </div>
          <ShoppingCard list={shopping} />
          <div className="mt-3">
            <ShareButtons text={shoppingText(shopping, job, sets)} />
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section aria-label="Notes for the workers" className="rounded-xl border border-line bg-card p-4 sm:p-5">
          <h2 className="mb-2 font-display text-2xl font-bold">Notes for the workers</h2>
          <ul className="space-y-1">
            {notes.map((note) => (
              <li key={`${note.name}-${note.note}`}>
                <span className="font-bold">{note.numbers}</span> {note.name}: {note.note}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlanBoards plan={plan} unit={unit} />

      <div className="no-print flex flex-wrap items-center gap-2 [&_button]:mt-0">
        {job.status === "draft" && (
          <>
            <ButtonLink href={`/jobs/${jobId}`} className="bg-transparent ring-1 ring-line">
              Not yet: change pieces
            </ButtonLink>
            {plan.unplaced.length === 0 && (
              <ActionForm action={acceptPlan} submitLabel="Yes: accept this plan" pendingLabel="Accepting…">
                <input type="hidden" name="jobId" value={jobId} />
              </ActionForm>
            )}
          </>
        )}
        {job.status === "accepted" && (
          <>
            <ButtonLink href={`/jobs/${jobId}/cut-sheet`}>Cut sheet</ButtonLink>
            <ButtonLink href={`/jobs/${jobId}/cost-summary`}>Cost summary</ButtonLink>
            <ActionForm action={markJobCut} submitLabel="Mark as cut" pendingLabel="Saving…">
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
            <ActionForm action={reopenJob} submitLabel="Change the plan" pendingLabel="Reopening…" subtle>
              <input type="hidden" name="jobId" value={jobId} />
            </ActionForm>
          </>
        )}
        {job.status === "cut" && (
          <>
            <ButtonLink href={`/jobs/${jobId}/cut-sheet`}>Cut sheet</ButtonLink>
            <ButtonLink href={`/jobs/${jobId}/cost-summary`}>Cost summary</ButtonLink>
            <ActionForm action={undoJobCut} submitLabel="Undo cut" pendingLabel="Undoing…" subtle>
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

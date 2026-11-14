import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/button-link";
import { PrintButton } from "@/components/print-button";
import { ShoppingCard } from "@/components/shopping-card";
import { getJob, getLeftovers, getMaterials, getPieces, getPlan, getSections, getWorkshop } from "@/lib/data";
import { planJob } from "@/lib/planner/plan-job";
import { shoppingList } from "@/lib/planner/shopping";

/** The shopping list on its own, to print. A draft is planned fresh, as on the plan page. */
export default async function ShoppingListPage({ params }: PageProps<"/jobs/[jobId]/shopping-list">) {
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

  if (!job) notFound();
  if (pieces.length === 0) redirect(`/jobs/${jobId}`);

  const plan = saved ?? planJob({ pieces, materials, leftovers, kerfMm: workshop.kerfMm, sets: job.sets, sections });
  if (plan.unplaced.length > 0) redirect(`/jobs/${jobId}/plan`);
  const sets = plan.sets ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Shopping list</h1>
          <p className="text-muted">
            {job.name}
            {sets > 1 && ` × ${sets} sets`}
            {job.customer && ` · ${job.customer}`}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <span className="no-print">
            <ButtonLink href={`/jobs/${jobId}/plan`} className="block bg-transparent ring-1 ring-line">
              Back
            </ButtonLink>
          </span>
        </div>
      </div>
      <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
        <ShoppingCard list={shoppingList(plan, workshop.displayUnit)} />
      </section>
    </div>
  );
}

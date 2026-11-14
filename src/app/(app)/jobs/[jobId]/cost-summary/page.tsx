import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/button-link";
import { LogoBadge } from "@/components/logo";
import { PrintButton } from "@/components/print-button";
import { getJob, getPlan, getWorkshop } from "@/lib/data";
import { quoteTotal } from "@/lib/planner/quote";
import { formatMoney, formatSize } from "@/lib/units";

export default async function CostSummaryPage({ params }: PageProps<"/jobs/[jobId]/cost-summary">) {
  const { jobId } = await params;
  const [workshop, job, plan] = await Promise.all([getWorkshop(), getJob(jobId), getPlan(jobId)]);

  if (!job) {
    notFound();
  }
  if (!plan) {
    redirect(`/jobs/${jobId}/plan`);
  }

  const unit = workshop.displayUnit;
  const stored = [...plan.boards, ...plan.planks].filter((stock) => stock.source === "leftover");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The customer keeps this page, and the header is not printed. */}
        <div className="flex items-center gap-3">
          <LogoBadge className="size-14" />
          <div>
            <h1 className="font-display text-3xl font-bold">Cost summary</h1>
            <p className="text-muted">{workshop.name}</p>
          </div>
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
        <p className="font-semibold">
          {job.name}
          {(plan.sets ?? 1) > 1 && ` × ${plan.sets} sets`}
        </p>
        {job.customer && <p className="text-muted">For {job.customer}</p>}

        <table className="mt-4 w-full text-left">
          <thead className="font-mono text-xs uppercase text-muted">
            <tr>
              <th className="py-1 pr-2">Material</th>
              <th className="py-1 pr-2">Qty</th>
              <th className="py-1 text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {plan.buy.map((item) => (
              <tr key={`${item.materialId}-${item.lengthMm}`} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  {item.name}
                  <span className="block text-sm text-muted">{formatSize(item.lengthMm, item.widthMm, unit)}</span>
                </td>
                <td className="py-1.5 pr-2">{item.count}</td>
                <td className="py-1.5 text-right">{formatMoney(item.unitPrice * item.count)}</td>
              </tr>
            ))}
            {stored.map((stock) => (
              <tr key={stock.leftoverId} className="border-t border-line">
                <td className="py-1.5 pr-2">
                  {stock.materialName}
                  <span className="block text-sm text-muted">From stock</span>
                </td>
                <td className="py-1.5 pr-2">1</td>
                <td className="py-1.5 text-right">{formatMoney(stock.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {job.quoteMode === "part-used" && (
          <p className="mt-3 text-sm text-muted">
            Charged for the wood used in this job
            {job.wasteAllowancePercent > 0 && `, plus a ${job.wasteAllowancePercent}% waste allowance`}.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 border-t-4 border-ruler pt-3">
          <span className="font-display text-2xl font-bold">Material total</span>
          <span className="whitespace-nowrap font-display text-3xl font-bold">{formatMoney(quoteTotal(plan, job))}</span>
        </div>
      </section>
    </div>
  );
}

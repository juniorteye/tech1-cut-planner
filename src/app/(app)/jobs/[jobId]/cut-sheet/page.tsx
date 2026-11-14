import { notFound, redirect } from "next/navigation";
import { ButtonLink } from "@/components/button-link";
import { PlanBoards } from "@/components/plan-boards";
import { PrintButton } from "@/components/print-button";
import { getJob, getPlan, getWorkshop } from "@/lib/data";
import { bandingByColour, describeEdges } from "@/lib/planner/banding";
import { formatMetres, formatSize } from "@/lib/units";

export default async function CutSheetPage({ params }: PageProps<"/jobs/[jobId]/cut-sheet">) {
  const { jobId } = await params;
  const [workshop, job, plan] = await Promise.all([getWorkshop(), getJob(jobId), getPlan(jobId)]);

  if (!job) {
    notFound();
  }
  if (!plan) {
    redirect(`/jobs/${jobId}/plan`);
  }

  const unit = workshop.displayUnit;
  const rows = [
    ...plan.boards.flatMap((board, index) =>
      board.placements.map((placed) => ({
        number: placed.number,
        name: placed.name,
        size: formatSize(placed.lengthMm, placed.widthMm, unit),
        from: `Board ${index + 1}${placed.turned ? " (turned)" : ""}`,
        edges: describeEdges({ bandedLengths: placed.bandedLengths ?? 0, bandedWidths: placed.bandedWidths ?? 0 }),
      })),
    ),
    ...plan.planks.flatMap((plank) =>
      plank.cuts.map((cut) => ({
        number: cut.number,
        name: cut.name,
        size: formatSize(cut.lengthMm, null, unit),
        from: plank.materialName,
        edges: "",
      })),
    ),
  ].sort((a, b) => a.number - b.number);
  const banding = bandingByColour(plan.banding);
  const showEdges = banding.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Cut sheet</h1>
          <p className="text-muted">
            {job.name}
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

      {showEdges && (
        <p className="rounded-xl border border-line bg-card p-4">
          <span className="font-semibold">Edge banding: </span>
          {banding.map((line) => `${formatMetres(line.mm)} for ${line.colour}`).join(", ")}. Long means the
          part&apos;s longer side, short its shorter side.
        </p>
      )}

      <PlanBoards plan={plan} unit={unit} />

      <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
        <h2 className="mb-2 font-display text-2xl font-bold">Numbered list</h2>
        {/* A size broken over two lines is easy to misread at the saw, so sizes
            never wrap; on a very narrow phone the table scrolls instead. */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="font-mono text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">Piece</th>
                <th className="py-1 pr-2">Size</th>
                <th className="py-1 pr-2">From</th>
                {showEdges && <th className="py-1">Band</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.number} className="border-t border-line">
                  <td className="py-1.5 pr-2 font-bold">{row.number}</td>
                  <td className="py-1.5 pr-2">{row.name}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-sm">{row.size}</td>
                  <td className="py-1.5 pr-2 text-sm text-muted">{row.from}</td>
                  {showEdges && <td className="py-1.5 text-sm">{row.edges === "none" ? "–" : row.edges}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

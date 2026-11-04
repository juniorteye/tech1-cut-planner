import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { ButtonLink } from "@/components/button-link";
import { StatusBadge } from "@/components/card";
import { DeleteJob } from "@/components/delete-job";
import { SavedPagesSync } from "@/components/offline";
import { getJobs } from "@/lib/data";
import type { JobStatus } from "@/lib/types";
import { copyJob } from "./jobs/actions";

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  accepted: "Ready to cut",
  cut: "Cut",
  cancelled: "Cancelled",
};

export default async function JobsPage() {
  const jobs = await getJobs();
  const savedPages = jobs
    .filter((job) => job.status === "accepted" || job.status === "cut")
    .flatMap((job) => [`/jobs/${job.id}/cut-sheet`, `/jobs/${job.id}/cost-summary`]);

  return (
    <>
      <SavedPagesSync paths={savedPages} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold">Jobs</h1>
        <ButtonLink href="/jobs/new">New job</ButtonLink>
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line p-8 text-center text-muted">
          No jobs yet. Start one to plan your cuts.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4">
              <Link
                href={job.status === "draft" ? `/jobs/${job.id}` : `/jobs/${job.id}/cut-sheet`}
                className="min-w-0 flex-1"
              >
                <span className="block truncate font-semibold">{job.name}</span>
                {job.customer && <span className="block truncate text-sm text-muted">{job.customer}</span>}
                <span className="mt-1 inline-block">
                  <StatusBadge label={STATUS_LABELS[job.status]} />
                </span>
              </Link>
              <ActionForm action={copyJob} submitLabel="Copy" subtle>
                <input type="hidden" name="id" value={job.id} />
              </ActionForm>
              {job.status === "draft" && <DeleteJob jobId={job.id} jobName={job.name} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

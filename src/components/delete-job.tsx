"use client";

import { useState } from "react";
import { deleteJob } from "@/app/(app)/jobs/actions";
import { ActionForm } from "./action-form";

const SUBTLE_BUTTON = "rounded-md px-4 py-2 font-semibold bg-transparent text-muted ring-1 ring-line";

/** Asks first, because a deleted job cannot be brought back. */
export function DeleteJob({ jobId, jobName }: { jobId: string; jobName: string }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={SUBTLE_BUTTON}>
        Delete
      </button>
    );
  }

  return (
    <div className="flex basis-full flex-wrap items-center gap-2 border-t border-line pt-3">
      <p className="mr-auto font-semibold">Delete {jobName}? This cannot be undone.</p>
      <button type="button" onClick={() => setAsking(false)} className={SUBTLE_BUTTON}>
        Keep it
      </button>
      <ActionForm action={deleteJob} submitLabel="Yes, delete" pendingLabel="Deleting…" subtle>
        <input type="hidden" name="id" value={jobId} />
      </ActionForm>
    </div>
  );
}

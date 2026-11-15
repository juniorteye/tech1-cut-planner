"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { saveSets } from "../actions";

/**
 * How many sets, as one joined control: the box and its button. The button
 * says what will happen: yellow "Save sets" once the number has changed,
 * "Saving…" while it waits, then "✓ Saved". Nothing moves around it.
 */
export function SetsForm({ jobId, sets }: { jobId: string; sets: number }) {
  const [state, run, pending] = useActionState(saveSets, {} as ActionResult);
  const [value, setValue] = useState(String(sets));
  const [savedValue, setSavedValue] = useState(String(sets));
  const [noSignal, setNoSignal] = useState(false);
  const changed = value !== savedValue;
  const error = noSignal ? "You need a connection for this." : changed || pending ? undefined : state.error;
  const justSaved = !changed && !pending && !error && Boolean(state.savedAt);

  return (
    <form
      className="w-full sm:w-auto"
      onSubmit={(event) => {
        event.preventDefault();
        setNoSignal(!navigator.onLine);
        if (!navigator.onLine) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => run(data));
        setSavedValue(value);
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <label htmlFor="sets" className="text-sm font-semibold">
        How many sets
      </label>
      <div
        className={`mt-1 flex h-11 w-full overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-ruler sm:w-60 ${
          error ? "border-red-700" : "border-line"
        }`}
      >
        <input
          id="sets"
          name="sets"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "sets-error" : undefined}
          className="w-full min-w-0 flex-1 px-3 text-base outline-none"
        />
        {/* Autofill and password extensions tag form buttons before React loads; that is not a mismatch in the app. */}
        <button
          type="submit"
          suppressHydrationWarning
          disabled={pending || (!changed && !error)}
          aria-live="polite"
          className={`inline-flex shrink-0 items-center justify-center gap-2 border-l border-line px-4 text-sm font-semibold transition-colors ${
            changed || pending || error ? "bg-ruler text-ink hover:brightness-95" : justSaved ? "bg-keep text-keep-ink" : "bg-card text-muted"
          }`}
        >
          {pending ? (
            <>
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Saving…
            </>
          ) : justSaved ? (
            <>
              <span aria-hidden="true">✓</span> Saved
            </>
          ) : (
            "Save sets"
          )}
        </button>
      </div>
      {error && (
        <p id="sets-error" role="alert" className="mt-1 text-sm sm:max-w-60 font-semibold text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}

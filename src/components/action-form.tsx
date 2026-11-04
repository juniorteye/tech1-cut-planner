"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

type ActionFormProps = {
  action: (state: ActionResult, data: FormData) => Promise<ActionResult>;
  submitLabel: string;
  savedMessage?: string;
  subtle?: boolean;
  resetOnSave?: boolean;
  className?: string;
  children?: ReactNode;
};

/** Submits by hand because a plain form action would clear what the user typed on an error. */
export function ActionForm({
  action,
  submitLabel,
  savedMessage,
  subtle,
  resetOnSave,
  className = "",
  children,
}: ActionFormProps) {
  const [state, run, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const [noSignal, setNoSignal] = useState(false);
  const error = noSignal ? "You need a connection for this." : state.error;

  useEffect(() => {
    if (resetOnSave && state.savedAt) {
      form.current?.reset();
    }
  }, [resetOnSave, state.savedAt]);

  return (
    <form
      ref={form}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        setNoSignal(!navigator.onLine);
        if (!navigator.onLine) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {children}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      {!error && savedMessage && state.savedAt && (
        <p className="mt-2 text-sm font-semibold text-keep-ink">{savedMessage}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-4 py-2 font-semibold disabled:opacity-60 ${
          subtle ? "bg-transparent text-muted ring-1 ring-line" : "mt-3 bg-ruler text-ink"
        }`}
      >
        {submitLabel}
      </button>
    </form>
  );
}

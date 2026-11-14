"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

type ActionFormProps = {
  action: (state: ActionResult, data: FormData) => Promise<ActionResult>;
  submitLabel: string;
  /** What the button says while it waits, e.g. "Adding…". */
  pendingLabel: string;
  savedMessage?: string;
  subtle?: boolean;
  resetOnSave?: boolean;
  className?: string;
  /** Runs after each successful save, e.g. to close an editor. */
  onSaved?: () => void;
  /** Keeps the button off until the form is ready, e.g. a pasted list still has unread lines. */
  disabled?: boolean;
  children?: ReactNode;
};

/** Submits by hand because a plain form action would clear what the user typed on an error. */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  savedMessage,
  subtle,
  resetOnSave,
  className = "",
  onSaved,
  disabled = false,
  children,
}: ActionFormProps) {
  const [state, run, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  const [noSignal, setNoSignal] = useState(false);
  const error = noSignal ? "You need a connection for this." : state.error;

  const savedHandler = useRef(onSaved);
  useEffect(() => {
    savedHandler.current = onSaved;
  });

  useEffect(() => {
    if (resetOnSave && state.savedAt) {
      form.current?.reset();
    }
    if (state.savedAt) savedHandler.current?.();
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
        disabled={pending || disabled}
        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 font-semibold disabled:opacity-60 ${
          subtle ? "bg-transparent text-muted ring-1 ring-line" : "mt-3 bg-ruler text-ink"
        }`}
      >
        {pending && (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}

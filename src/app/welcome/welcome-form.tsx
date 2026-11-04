"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { createWorkshop, type WorkshopState } from "./actions";

const initialState: WorkshopState = {};

export function WelcomeForm() {
  const [state, formAction, pending] = useActionState(createWorkshop, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <FormField label="Workshop name" name="name" autoComplete="organization" required />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-ruler px-4 py-2 font-semibold disabled:opacity-60"
      >
        Continue
      </button>
    </form>
  );
}

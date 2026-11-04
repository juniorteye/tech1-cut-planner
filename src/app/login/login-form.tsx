"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormField } from "@/components/form-field";
import { PasswordField } from "@/components/password-field";
import { authenticate, type AuthState } from "./actions";

const initialState: AuthState = {};

function LoginButtons() {
  const { pending, data } = useFormStatus();
  const loggingIn = pending && data?.get("intent") !== "forgot";

  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-ruler px-4 py-2 font-semibold disabled:opacity-60"
      >
        {loggingIn && (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-ink border-t-transparent"
          />
        )}
        {loggingIn ? "Logging in…" : "Log in"}
      </button>
      <button
        type="submit"
        name="intent"
        value="forgot"
        formNoValidate
        disabled={pending}
        className="min-h-10 w-full text-sm font-semibold text-muted disabled:opacity-60"
      >
        Forgot password?
      </button>
    </>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(authenticate, initialState);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.email}
        required
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="current-password"
        required
      />

      {state.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}
      {state.message && <p className="text-sm font-semibold text-keep-ink">{state.message}</p>}

      <LoginButtons />
    </form>
  );
}

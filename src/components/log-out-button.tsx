"use client";

import { signOut } from "@/app/login/actions";

export function LogOutButton() {
  return (
    <form
      action={signOut}
      className="ml-auto sm:order-last"
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage({ type: "clear-saved-pages" });
      }}
    >
      {/* Extensions may tag this button before React loads; see ActionForm. */}
      <button type="submit" suppressHydrationWarning className="min-h-10 px-3 py-1.5 text-sm font-semibold text-muted">
        Log out
      </button>
    </form>
  );
}

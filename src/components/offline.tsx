"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker?.register("/sw.js");
      return;
    }
    // The dev server keeps the same file names while their contents change, so a
    // saved copy would hide every edit. Remove it and what it saved.
    navigator.serviceWorker?.getRegistrations().then((all) => all.forEach((registration) => registration.unregister()));
    window.caches?.keys().then((keys) => keys.forEach((key) => window.caches.delete(key)));
  }, []);
  return null;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  if (online) {
    return null;
  }
  return (
    <p role="status" className="no-print bg-ink px-4 py-2 text-center text-sm font-semibold text-white">
      No signal. You are seeing saved copies, and changes need a connection.
    </p>
  );
}

/** Saves these pages to the device, and forgets any saved page no longer listed. */
export function SavedPagesSync({ paths }: { paths: string[] }) {
  const key = paths.join("|");

  useEffect(() => {
    navigator.serviceWorker?.ready.then((registration) => {
      registration.active?.postMessage({ type: "sync-saved-pages", paths: key ? key.split("|") : [] });
    });
  }, [key]);

  return null;
}

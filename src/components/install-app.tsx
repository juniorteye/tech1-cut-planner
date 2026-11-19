"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Chrome's own install event; not in TypeScript's DOM types yet.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const HIDDEN_KEY = "install-card-hidden";

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// iPads report themselves as Macs, but Macs have no touch screen.
function isIphone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const noChange = () => () => {};

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Share" role="img" className="inline size-5 -translate-y-0.5 align-middle">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Offers to put the planner on the phone's home screen, until installed or hidden. */
export function InstallApp() {
  // Read once in the browser; the server never shows the card.
  const startsHidden = useSyncExternalStore(noChange, () => readHidden() || isInstalled(), () => true);
  const iphone = useSyncExternalStore(noChange, isIphone, () => false);
  const [hidden, setHidden] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const offer = (event: Event) => {
      event.preventDefault(); // Show our card instead of Chrome's small bar.
      setInstallEvent(event as InstallEvent);
    };
    const installed = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (startsHidden || hidden || (!installEvent && !iphone)) {
    return null;
  }

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Private browsing: the card just comes back next time.
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === "accepted") setHidden(true);
  }

  return (
    <section
      aria-label="Install the app"
      className="no-print mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center gap-3 rounded-xl border border-line bg-card p-4"
    >
      <p className="min-w-0 flex-1 basis-56">
        <span className="block font-semibold">Put Tech1 Cut Planner on your phone</span>
        {installEvent ? (
          <span className="block text-sm text-muted">It opens like an app, from its own icon.</span>
        ) : (
          <span className="block text-sm text-muted">
            Tap <ShareIcon /> Share, then <strong className="text-ink">Add to Home Screen</strong>.
          </span>
        )}
      </p>
      <div className="flex gap-2">
        {installEvent && (
          <button type="button" onClick={install} className="rounded-md bg-ruler px-4 py-2 font-semibold text-ink">
            Install
          </button>
        )}
        <button type="button" onClick={hide} className="rounded-md px-3 py-2 font-semibold text-muted">
          {installEvent ? "Not now" : "Got it"}
        </button>
      </div>
    </section>
  );
}

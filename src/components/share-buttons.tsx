"use client";

import { useState } from "react";

/** Copies the shopping list as plain text for WhatsApp, or opens WhatsApp with it. */
export function ShareButtons({ text }: { text: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied("yes");
          } catch {
            setCopied("no");
          }
        }}
        className="min-h-10 rounded-md bg-ruler px-4 font-semibold text-ink"
      >
        Copy for WhatsApp
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-10 items-center rounded-md px-4 font-semibold ring-1 ring-line"
      >
        Send on WhatsApp
      </a>
      <p role="status" className="text-sm font-semibold text-keep-ink">
        {copied === "yes" && "Copied. Paste it into a WhatsApp chat."}
        {copied === "no" && <span className="text-red-700">This phone would not copy. Use Send on WhatsApp instead.</span>}
      </p>
    </div>
  );
}

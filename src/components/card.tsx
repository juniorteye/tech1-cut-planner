import type { ReactNode } from "react";

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
      {title && <h2 className="mb-3 font-display text-2xl font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function StatusBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-xs uppercase text-white">
      {label}
    </span>
  );
}

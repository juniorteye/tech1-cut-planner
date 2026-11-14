/** "× 5 sets": shown wherever totals are for the whole list made several times. */
export function SetsBadge({ sets, className = "" }: { sets: number; className?: string }) {
  return (
    <p className={`inline-block rounded-full bg-ink px-3 py-1 font-display text-lg font-bold text-white ${className}`}>
      × {sets} sets
    </p>
  );
}

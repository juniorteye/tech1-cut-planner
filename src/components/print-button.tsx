"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md bg-ruler px-4 py-2 font-semibold"
    >
      Print
    </button>
  );
}

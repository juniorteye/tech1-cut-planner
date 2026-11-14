"use client";

import { useState, type ReactNode } from "react";
import { ActionForm } from "@/components/action-form";
import type { DisplayUnit, Material, Piece } from "@/lib/types";
import { updatePiece } from "../actions";
import { PieceFields } from "./piece-fields";

/**
 * The row's buttons (Edit, then whatever is passed in, such as Remove) and
 * the form Edit opens. Returned as two flex items of the row, so the buttons
 * stay on the right and the form takes the full width below, never squeezed
 * inside the button group.
 */
export function PieceEditor({
  piece,
  materials,
  unit,
  children,
}: {
  piece: Piece;
  materials: Material[];
  unit: DisplayUnit;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex shrink-0 gap-2 [&_button]:mt-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="min-h-10 shrink-0 rounded-md px-4 py-2 font-semibold text-muted ring-1 ring-line"
        >
          {open ? "Close" : "Edit"}
        </button>
        {children}
      </div>
      {open && (
        <div className="order-last min-w-0 basis-full rounded-md border border-line p-3">
          <ActionForm
            action={updatePiece}
            submitLabel="Save part"
            pendingLabel="Saving…"
            onSaved={() => setOpen(false)}
          >
            <input type="hidden" name="id" value={piece.id} />
            <input type="hidden" name="jobId" value={piece.jobId} />
            <PieceFields materials={materials} unit={unit} piece={piece} />
          </ActionForm>
        </div>
      )}
    </>
  );
}

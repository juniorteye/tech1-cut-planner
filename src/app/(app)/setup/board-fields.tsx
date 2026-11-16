"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { LARGE_SHEET, STANDARD_SHEET } from "@/lib/defaults";
import { suggestBandingColour } from "@/lib/planner/banding";
import type { Board } from "@/lib/types";
import { formatMoneyInput } from "./format";

export function BoardFields({ board, boards }: { board?: Board; boards: Board[] }) {
  const matches = (sheet: { lengthMm: number; widthMm: number }) =>
    board?.lengthMm === sheet.lengthMm && board?.widthMm === sheet.widthMm;
  const initial = !board || matches(STANDARD_SHEET) ? "standard" : matches(LARGE_SHEET) ? "large" : "other";
  const [size, setSize] = useState(initial);
  const [name, setName] = useState(board?.name ?? "");
  // Blank means "work it out": the tape a matching board uses, or else the board name.
  const [colour, setColour] = useState(board?.bandingColour ?? "");
  const [colourTyped, setColourTyped] = useState(Boolean(board));
  const [noBanding, setNoBanding] = useState(board?.noBanding ?? false);
  const root = useRef<HTMLDivElement>(null);
  const others = boards.filter((other) => other.id !== board?.id);
  const suggested = suggestBandingColour(name, others);
  const shownColour = colourTyped ? colour : (suggested ?? "");

  // A saved "Add board" form is cleared, so the size goes back to match it.
  // Otherwise "Other size" would stay picked with its boxes emptied.
  useEffect(() => {
    const form = root.current?.closest("form");
    const onReset = () => {
      setSize(initial);
      setName(board?.name ?? "");
      setColour(board?.bandingColour ?? "");
      setColourTyped(Boolean(board));
      setNoBanding(board?.noBanding ?? false);
    };
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [initial, board]);

  return (
    <div ref={root} className="grid gap-3 sm:grid-cols-2">
      {board && <input type="hidden" name="id" value={board.id} />}
      <FormField
        label="Name"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Plywood 18 mm"
        required
      />
      <SelectField label="Type" name="boardType" defaultValue={board?.boardType ?? "plywood"}>
        <option value="plywood">Plywood</option>
        <option value="mdf">MDF</option>
        <option value="chipboard">Chipboard</option>
        <option value="melamine">Melamine</option>
      </SelectField>
      <SelectField label="Sheet size" name="size" value={size} onChange={(e) => setSize(e.target.value)}>
        <option value="standard">8 × 4 ft (242 × 121 cm)</option>
        <option value="large">9 × 7 ft (282 × 212 cm)</option>
        <option value="other">Other size</option>
      </SelectField>
      {size === "other" && (
        <>
          <FormField label="Length (mm)" name="length" inputMode="decimal" defaultValue={board?.lengthMm} required />
          <FormField label="Width (mm)" name="width" inputMode="decimal" defaultValue={board?.widthMm} required />
        </>
      )}
      <FormField label="Thickness (mm)" name="thickness" inputMode="decimal" defaultValue={board?.thicknessMm} placeholder="18" required />
      <FormField
        label="Price per sheet (GH¢)"
        name="price"
        inputMode="decimal"
        defaultValue={board ? formatMoneyInput(board.pricePerSheet) : undefined}
        placeholder="450"
        required
      />
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-10 items-center gap-2 self-end">
          <input
            type="checkbox"
            name="noBanding"
            className="size-5"
            checked={noBanding}
            onChange={(event) => setNoBanding(event.target.checked)}
          />
          <span className="text-sm font-semibold">No edge banding (back panels)</span>
        </label>
        {!noBanding && (
          <div>
            <FormField
              label="Banding colour"
              name="bandingColour"
              value={shownColour}
              onChange={(event) => {
                setColour(event.target.value);
                setColourTyped(true);
              }}
              placeholder={name.trim() || "Same as the board name"}
            />
            <p className="mt-1 text-sm text-muted">
              {!colourTyped && suggested
                ? "Same tape as the board you already have. Boards with one colour share a banding total."
                : "Boards with the same colour share one banding total."}
            </p>
          </div>
        )}
      </div>
      <FormField
        label="Edge trim per side (mm)"
        name="trim"
        inputMode="decimal"
        defaultValue={board?.edgeTrimMm}
        placeholder="Blank for the usual amount"
      />
      <FormField
        label="Narrowest offcut to keep (mm)"
        name="minShortSide"
        inputMode="decimal"
        defaultValue={board?.minLeftoverShortSideMm}
        placeholder="100"
      />
      <FormField
        label="Smallest offcut to keep (m²)"
        name="minArea"
        inputMode="decimal"
        defaultValue={board ? board.minLeftoverAreaMm2 / 1_000_000 : undefined}
        placeholder="0.09"
      />
    </div>
  );
}

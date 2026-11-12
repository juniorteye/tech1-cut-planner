"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { LARGE_SHEET, STANDARD_SHEET } from "@/lib/defaults";
import type { Board } from "@/lib/types";
import { formatMoneyInput } from "./format";

export function BoardFields({ board }: { board?: Board }) {
  const matches = (sheet: { lengthMm: number; widthMm: number }) =>
    board?.lengthMm === sheet.lengthMm && board?.widthMm === sheet.widthMm;
  const initial = !board || matches(STANDARD_SHEET) ? "standard" : matches(LARGE_SHEET) ? "large" : "other";
  const [size, setSize] = useState(initial);
  const root = useRef<HTMLDivElement>(null);

  // A saved "Add board" form is cleared, so the size goes back to match it.
  // Otherwise "Other size" would stay picked with its boxes emptied.
  useEffect(() => {
    const form = root.current?.closest("form");
    const onReset = () => setSize(initial);
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [initial]);

  return (
    <div ref={root} className="grid gap-3 sm:grid-cols-2">
      {board && <input type="hidden" name="id" value={board.id} />}
      <FormField label="Name" name="name" defaultValue={board?.name} placeholder="Plywood 18 mm" required />
      <SelectField label="Type" name="boardType" defaultValue={board?.boardType ?? "plywood"}>
        <option value="plywood">Plywood</option>
        <option value="mdf">MDF</option>
        <option value="chipboard">Chipboard</option>
        <option value="melamine">Melamine</option>
      </SelectField>
      <SelectField label="Sheet size" name="size" value={size} onChange={(e) => setSize(e.target.value)}>
        <option value="standard">8 × 4 ft (242 × 121 cm)</option>
        <option value="large">9 × 7 ft (272 × 212 cm)</option>
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

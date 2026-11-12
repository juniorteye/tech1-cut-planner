"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import type { DisplayUnit, Material } from "@/lib/types";
import { formatLength, parseLength } from "@/lib/units";
import { EdgePicker, NO_EDGES, type Edges } from "./edge-picker";

const HINTS: Record<DisplayUnit, string> = { mm: "mm", cm: "cm", "ft-in": "ft, in" };

export function PieceFields({
  materials,
  unit,
  defaultMaterialId,
}: {
  materials: Material[];
  unit: DisplayUnit;
  defaultMaterialId?: string;
}) {
  const [materialId, setMaterialId] = useState(defaultMaterialId ?? materials[0]?.id ?? "");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [edges, setEdges] = useState<Edges>(NO_EDGES);
  const root = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);

  // Size and quantity are held here rather than left to the form: a form reset
  // behind React's back would make it ignore retyping the previous part's width.
  // After a part is saved the form is cleared. The board stays chosen, since
  // a job is usually cut from one board, but the edges start blank again so
  // each part's banding is marked on purpose.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    // The reset event fires before the form clears, so the board can be read here.
    const onReset = () => {
      const keep = select.current?.value;
      setLength("");
      setWidth("");
      setQuantity("1");
      setEdges(NO_EDGES);
      setTimeout(() => {
        if (select.current && keep) select.current.value = keep;
      });
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const isTimber = materials.find((material) => material.id === materialId)?.kind === "timber";
  const hasTimber = materials.some((material) => material.kind === "timber");
  const hint = HINTS[unit];
  const lengthMm = parseLength(length, unit);
  const widthMm = parseLength(width, unit);
  const label = (mm: number | null, fallback: string) => (mm ? formatLength(mm, unit) : fallback);

  return (
    <div ref={root} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <SelectField
          ref={select}
          label={hasTimber ? "Board or timber" : "Board"}
          name="materialId"
          value={materialId}
          onChange={(event) => setMaterialId(event.target.value)}
        >
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_6rem]">
        <FormField
          label={`Length (${hint})`}
          name="length"
          inputMode={unit === "ft-in" ? "text" : "decimal"}
          value={length}
          onChange={(event) => setLength(event.target.value)}
          required
        />
        <span className="pb-2 text-muted" aria-hidden>
          ×
        </span>
        {isTimber ? (
          <span className="pb-2 text-sm text-muted">cut to length</span>
        ) : (
          <FormField
            label={`Width (${hint})`}
            name="width"
            inputMode={unit === "ft-in" ? "text" : "decimal"}
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            required
          />
        )}
        <span className="hidden pb-2 text-muted sm:block" aria-hidden>
          –
        </span>
        <div className="col-span-3 sm:col-span-1">
          <FormField
            label="How many"
            name="quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </div>
      </div>
      {!isTimber && (
        <EdgePicker
          edges={edges}
          onChange={setEdges}
          lengthMm={lengthMm}
          widthMm={widthMm}
          quantity={Number(quantity)}
          longLabel={lengthMm && widthMm ? label(Math.max(lengthMm, widthMm), "") : "long"}
          shortLabel={lengthMm && widthMm ? label(Math.min(lengthMm, widthMm), "") : "short"}
        />
      )}
      <FormField label="Name (optional)" name="name" placeholder="Side panel" />
      {!isTimber && (
        <label className="flex min-h-10 items-center gap-2 self-end">
          <input type="checkbox" name="grainLocked" className="size-5" />
          <span className="text-sm font-semibold">Grain must run along the length</span>
        </label>
      )}
    </div>
  );
}

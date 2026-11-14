"use client";

import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import type { DisplayUnit, Material, Mm, Piece } from "@/lib/types";
import { formatLength, parseLength } from "@/lib/units";
import { EdgePicker, NO_EDGES, type Edges } from "./edge-picker";

const HINTS: Record<DisplayUnit, string> = { mm: "mm", cm: "cm", "ft-in": "ft, in" };

/** The marks he uses most, one tap each. Anything else is tapped on the rectangle. */
export const EDGE_PRESETS: { label: string; edges: Edges }[] = [
  { label: "None", edges: NO_EDGES },
  { label: "1 long", edges: { ...NO_EDGES, left: true } },
  { label: "2 long", edges: { ...NO_EDGES, left: true, right: true } },
  { label: "1 long + 2 short", edges: { left: true, right: false, top: true, bottom: true } },
  { label: "All 4", edges: { left: true, right: true, top: true, bottom: true } },
];

const counts = (edges: Edges) => [Number(edges.left) + Number(edges.right), Number(edges.top) + Number(edges.bottom)];
const sameCounts = (a: Edges, b: Edges) => counts(a).join() === counts(b).join();

/** A saved size as it should be typed back into the box, in the workshop's unit. */
function asTyped(mm: Mm | null, unit: DisplayUnit) {
  if (mm === null) return "";
  if (unit === "mm") return String(Math.round(mm * 10) / 10);
  if (unit === "cm") return String(Math.round(mm) / 10);
  return formatLength(mm, unit);
}

function edgesOf(piece: Pick<Piece, "bandedLengths" | "bandedWidths">): Edges {
  return {
    left: piece.bandedLengths >= 1,
    right: piece.bandedLengths >= 2,
    top: piece.bandedWidths >= 1,
    bottom: piece.bandedWidths >= 2,
  };
}

/**
 * Quick entry, typed the way he writes a list: width × length – quantity,
 * then the edges, then Enter. After a part is saved the boxes clear and the
 * cursor goes back to the width for the next line. With `piece` it is the
 * Edit form for that part instead.
 */
export function PieceFields({
  materials,
  unit,
  defaultMaterialId,
  piece,
}: {
  materials: Material[];
  unit: DisplayUnit;
  defaultMaterialId?: string;
  piece?: Piece;
}) {
  const [materialId, setMaterialId] = useState(piece?.materialId ?? defaultMaterialId ?? materials[0]?.id ?? "");
  const [length, setLength] = useState(asTyped(piece?.lengthMm ?? null, unit));
  const [width, setWidth] = useState(asTyped(piece?.widthMm ?? null, unit));
  const [quantity, setQuantity] = useState(String(piece?.quantity ?? 1));
  const [edges, setEdges] = useState<Edges>(piece ? edgesOf(piece) : NO_EDGES);
  const root = useRef<HTMLDivElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const firstBox = useRef<HTMLInputElement>(null);

  // Size and quantity are held here rather than left to the form: a form reset
  // behind React's back would make it ignore retyping the previous part's width.
  // After a part is saved the form is cleared. The board goes back to the
  // section's own board, since a part on another board (a long part on the
  // 9 × 7) is a one-off, the edges start blank so each part's banding is
  // marked on purpose, and the cursor goes back to the first size box.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form || piece) return;
    const fallback = defaultMaterialId ?? materials[0]?.id ?? "";
    const onReset = () => {
      setMaterialId(fallback);
      setLength("");
      setWidth("");
      setQuantity("1");
      setEdges(NO_EDGES);
      // The reset itself runs after this event, so the board is put back once it has.
      setTimeout(() => {
        if (select.current) select.current.value = fallback;
        firstBox.current?.focus();
      });
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultMaterialId, materials, piece]);

  const chosen = materials.find((material) => material.id === materialId);
  const isTimber = chosen?.kind === "timber";
  const noBanding = chosen?.kind === "board" && chosen.noBanding;
  const hasTimber = materials.some((material) => material.kind === "timber");
  const hint = HINTS[unit];
  const lengthMm = parseLength(length, unit);
  const widthMm = parseLength(width, unit);
  const label = (mm: number | null, fallback: string) => (mm ? formatLength(mm, unit) : fallback);
  const sizeMode = unit === "ft-in" ? "text" : "decimal";
  const lengthBox = (
    <FormField
      ref={isTimber ? firstBox : undefined}
      label={`Length (${hint})`}
      name="length"
      inputMode={sizeMode}
      enterKeyHint="next"
      value={length}
      onChange={(event) => setLength(event.target.value)}
      required
    />
  );

  return (
    <div ref={root} className="grid gap-3 sm:grid-cols-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_6rem]">
        {/* Boards: width × length, as he writes them. Timber is only cut to length. */}
        {isTimber ? (
          <>
            {lengthBox}
            <span aria-hidden />
            <span className="pb-2 text-sm text-muted">cut to length</span>
          </>
        ) : (
          <>
            <FormField
              ref={firstBox}
              label={`Width (${hint})`}
              name="width"
              inputMode={sizeMode}
              enterKeyHint="next"
              value={width}
              onChange={(event) => setWidth(event.target.value)}
              required
            />
            <span className="pb-2 text-muted" aria-hidden>
              ×
            </span>
            {lengthBox}
          </>
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
            enterKeyHint="done"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted sm:col-span-2">
        Either order: the bigger size is always the length. Enter saves the part.
      </p>

      {noBanding && <p className="text-sm text-muted sm:col-span-2">{chosen.name} takes no edge banding.</p>}
      {!isTimber && !noBanding && (
        <>
          <div role="group" aria-label="Quick edges" className="flex flex-wrap gap-2 sm:col-span-2">
            {EDGE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={sameCounts(edges, preset.edges)}
                onClick={() => setEdges(preset.edges)}
                className="min-h-10 rounded-md px-3 text-sm font-semibold ring-1 ring-line aria-pressed:bg-ink aria-pressed:text-white"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <EdgePicker
            edges={edges}
            onChange={setEdges}
            lengthMm={lengthMm}
            widthMm={widthMm}
            quantity={Number(quantity)}
            longLabel={lengthMm && widthMm ? label(Math.max(lengthMm, widthMm), "") : "long"}
            shortLabel={lengthMm && widthMm ? label(Math.min(lengthMm, widthMm), "") : "short"}
          />
        </>
      )}

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
      <FormField label="Name (optional)" name="name" placeholder="Side panel" defaultValue={piece?.name} />
      <FormField
        label="Note (optional)"
        name="note"
        placeholder="Thick tape on front"
        maxLength={200}
        defaultValue={piece?.note}
      />
      {!isTimber && (
        <label className="flex min-h-10 items-center gap-2 self-end">
          <input type="checkbox" name="grainLocked" className="size-5" defaultChecked={piece?.grainLocked} />
          <span className="text-sm font-semibold">Grain must run along the length</span>
        </label>
      )}
    </div>
  );
}

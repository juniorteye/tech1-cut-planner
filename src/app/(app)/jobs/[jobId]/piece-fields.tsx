"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import type { DisplayUnit, Material } from "@/lib/types";

export function PieceFields({ materials, unit }: { materials: Material[]; unit: DisplayUnit }) {
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const isTimber = materials.find((material) => material.id === materialId)?.kind === "timber";
  const hint = unit === "mm" ? "mm" : "ft, in";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Piece name" name="name" placeholder="Side panel" required />
      <SelectField
        label="Material"
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
      <FormField label={`Length (${hint})`} name="length" required />
      {!isTimber && <FormField label={`Width (${hint})`} name="width" required />}
      <FormField label="How many" name="quantity" type="number" min={1} defaultValue={1} required />
      {!isTimber && (
        <label className="flex min-h-10 items-center gap-2 self-end">
          <input type="checkbox" name="grainLocked" className="size-5" />
          <span className="text-sm font-semibold">Grain must run along the length</span>
        </label>
      )}
    </div>
  );
}

import { ActionForm } from "@/components/action-form";
import { Card, StatusBadge } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { getLeftovers, getMaterials, getWorkshop } from "@/lib/data";
import { formatLength, formatMoney, formatSize } from "@/lib/units";
import { addLeftover, setLeftoverStatus, updateLeftover } from "./actions";

export default async function LeftoversPage() {
  const [workshop, leftovers, materials] = await Promise.all([
    getWorkshop(),
    getLeftovers(),
    getMaterials(),
  ]);
  const unit = workshop.displayUnit;
  const materialName = (id: string) => materials.find((material) => material.id === id)?.name ?? "";
  const inStore = leftovers.filter((leftover) => ["available", "reserved"].includes(leftover.status));
  const damaged = leftovers.filter((leftover) => leftover.status === "damaged");
  const sizeText = (mm: number) => (unit === "mm" ? String(Math.round(mm * 10) / 10) : formatLength(mm, unit));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Leftover store</h1>
        <p className="text-muted">Used first on your next job.</p>
      </div>

      <Card>
        {inStore.length === 0 ? (
          <p className="text-muted">No leftovers yet. Offcuts appear here when a job is marked as cut.</p>
        ) : (
          <ul className="divide-y divide-line">
            {inStore.map((leftover) => (
              <li key={leftover.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {materialName(leftover.materialId)} · {formatSize(leftover.lengthMm, leftover.widthMm, unit)}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {formatMoney(leftover.value)}
                      {leftover.status === "reserved" && <StatusBadge label="Reserved" />}
                    </span>
                  </summary>
                  {leftover.status === "reserved" ? (
                    <p className="mt-2 text-sm text-muted">Held for an accepted job, so it cannot be changed.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <ActionForm action={updateLeftover} submitLabel="Fix size" pendingLabel="Saving…">
                        <input type="hidden" name="id" value={leftover.id} />
                        <div className="grid grid-cols-2 gap-3">
                          <FormField label="Length" name="length" defaultValue={sizeText(leftover.lengthMm)} required />
                          {leftover.widthMm !== null && (
                            <FormField label="Width" name="width" defaultValue={sizeText(leftover.widthMm)} required />
                          )}
                        </div>
                      </ActionForm>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={setLeftoverStatus} submitLabel="Mark damaged" pendingLabel="Saving…" subtle>
                          <input type="hidden" name="id" value={leftover.id} />
                          <input type="hidden" name="status" value="damaged" />
                        </ActionForm>
                        <ActionForm action={setLeftoverStatus} submitLabel="Used for something else" pendingLabel="Saving…" subtle>
                          <input type="hidden" name="id" value={leftover.id} />
                          <input type="hidden" name="status" value="used" />
                        </ActionForm>
                      </div>
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {materials.length > 0 && (
        <Card title="Add a leftover by hand">
          <ActionForm action={addLeftover} submitLabel="Add leftover" pendingLabel="Adding…" resetOnSave>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Material" name="materialId">
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
              </SelectField>
              <FormField label="Length" name="length" required />
              <FormField label="Width (boards only)" name="width" />
            </div>
          </ActionForm>
        </Card>
      )}

      {damaged.length > 0 && (
        <Card title="Damaged">
          <ul className="divide-y divide-line">
            {damaged.map((leftover) => (
              <li key={leftover.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {materialName(leftover.materialId)} · {formatSize(leftover.lengthMm, leftover.widthMm, unit)}
                </span>
                <ActionForm action={setLeftoverStatus} submitLabel="Put back" pendingLabel="Putting back…" subtle>
                  <input type="hidden" name="id" value={leftover.id} />
                  <input type="hidden" name="status" value="available" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

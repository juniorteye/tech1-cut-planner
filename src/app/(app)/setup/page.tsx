import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { getMaterials, getWorkshop } from "@/lib/data";
import { formatLength, formatMoney, formatSize } from "@/lib/units";
import { deleteMaterial, saveBoard, saveTimber, saveWorkshop } from "./actions";
import { BoardFields } from "./board-fields";
import { TimberFields } from "./timber-fields";

export default async function SetupPage() {
  const [workshop, materials] = await Promise.all([getWorkshop(), getMaterials()]);
  const unit = workshop.displayUnit;
  const boards = materials.filter((material) => material.kind === "board");
  const timbers = materials.filter((material) => material.kind === "timber");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">Set up your workshop</h1>

      <Card title="Your saw and units">
        <ActionForm action={saveWorkshop} submitLabel="Save">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Workshop name" name="name" defaultValue={workshop.name} required />
            <FormField label="Blade cut thickness (mm)" name="kerf" inputMode="decimal" defaultValue={workshop.kerfMm} required />
            <SelectField label="Show sizes in" name="unit" defaultValue={unit}>
              <option value="mm">Millimetres</option>
              <option value="cm">Centimetres</option>
              <option value="ft-in">Feet and inches</option>
            </SelectField>
          </div>
        </ActionForm>
      </Card>

      <Card title="Boards">
        <ul className="divide-y divide-line">
          {boards.map((board) => (
            <li key={board.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-semibold">{board.name}</span>
                  <span className="text-muted">
                    {formatSize(board.lengthMm, board.widthMm, unit)} · {formatMoney(board.pricePerSheet)}
                  </span>
                </summary>
                <div className="mt-3">
                  <ActionForm action={saveBoard} submitLabel="Save changes">
                    <BoardFields board={board} />
                  </ActionForm>
                  <ActionForm action={deleteMaterial} submitLabel="Remove" subtle className="mt-2">
                    <input type="hidden" name="id" value={board.id} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details open={boards.length === 0} className="mt-3">
          <summary className="cursor-pointer font-semibold">Add a board</summary>
          <ActionForm action={saveBoard} submitLabel="Add board" resetOnSave className="mt-3">
            <BoardFields />
          </ActionForm>
        </details>
      </Card>

      <Card title="Timber">
        <ul className="divide-y divide-line">
          {timbers.map((timber) => (
            <li key={timber.id} className="py-3">
              <details>
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-semibold">{timber.name}</span>
                  <span className="text-muted">
                    {timber.lengths
                      .map((length) => `${formatLength(length.lengthMm, "ft-in")} ${formatMoney(length.pricePerPiece)}`)
                      .join(" · ")}
                  </span>
                </summary>
                <div className="mt-3">
                  <ActionForm action={saveTimber} submitLabel="Save changes">
                    <TimberFields timber={timber} />
                  </ActionForm>
                  <ActionForm action={deleteMaterial} submitLabel="Remove" subtle className="mt-2">
                    <input type="hidden" name="id" value={timber.id} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <details open={timbers.length === 0} className="mt-3">
          <summary className="cursor-pointer font-semibold">Add timber</summary>
          <ActionForm action={saveTimber} submitLabel="Add timber" resetOnSave className="mt-3">
            <TimberFields />
          </ActionForm>
        </details>
      </Card>
    </div>
  );
}

import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import { getMaterials } from "@/lib/data";
import { createJob } from "../actions";

export default async function NewJobPage() {
  const materials = await getMaterials();
  // Boards first: most jobs start with a board section.
  const ordered = [...materials.filter((m) => m.kind === "board"), ...materials.filter((m) => m.kind === "timber")];

  return (
    <Card title="Start a new job">
      <ActionForm action={createJob} submitLabel="Create job" pendingLabel="Creating…">
        <div className="space-y-3">
          <FormField label="Job name" name="name" placeholder="Kitchen cabinet" required />
          <FormField label="Customer" name="customer" placeholder="Mrs. Mensah" />
          {ordered.length > 0 && (
            <fieldset className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-semibold">First section</legend>
              <FormField label="Section name" name="sectionName" placeholder="Miniyator" />
              <SelectField label="Board" name="materialId" defaultValue={ordered[0].id}>
                {ordered.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                  </option>
                ))}
              </SelectField>
              <p className="text-sm text-muted sm:col-span-2">
                Left blank, it is named after the board. You can add more sections, one per board, on the job.
              </p>
            </fieldset>
          )}
        </div>
      </ActionForm>
    </Card>
  );
}

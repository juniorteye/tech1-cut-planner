import { ActionForm } from "@/components/action-form";
import { Card } from "@/components/card";
import { FormField } from "@/components/form-field";
import { createJob } from "../actions";

export default function NewJobPage() {
  return (
    <Card title="Start a new job">
      <ActionForm action={createJob} submitLabel="Create job" pendingLabel="Creating…">
        <div className="space-y-3">
          <FormField label="Job name" name="name" placeholder="Kitchen cabinet" required />
          <FormField label="Customer" name="customer" placeholder="Mrs. Mensah" />
        </div>
      </ActionForm>
    </Card>
  );
}

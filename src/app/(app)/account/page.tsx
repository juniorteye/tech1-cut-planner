import { ActionForm } from "@/components/action-form";
import { Card, StatusBadge } from "@/components/card";
import { FormField } from "@/components/form-field";
import { PasswordField } from "@/components/password-field";
import { getMember, getTeam } from "@/lib/data";
import { addWorker, changePassword, removeWorker, setWorkerPassword } from "./actions";

export default async function AccountPage() {
  const member = await getMember();
  const team = member.role === "owner" ? await getTeam() : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Account</h1>
        <p className="text-muted">Logged in as {member.email}</p>
      </div>

      <Card title="Change your password">
        <ActionForm
          action={changePassword}
          submitLabel="Change password" pendingLabel="Changing…"
          savedMessage="Your password has been changed."
          resetOnSave
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <PasswordField label="New password" name="password" autoComplete="new-password" minLength={8} required />
            <PasswordField label="Type it again" name="confirm" autoComplete="new-password" minLength={8} required />
          </div>
        </ActionForm>
      </Card>

      {member.role === "owner" && (
        <>
          <Card title="Team">
            <ul className="divide-y divide-line">
              {team.map((person) => (
                <li key={person.userId} className="py-3">
                  {person.role === "owner" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{person.email}</span>
                      <StatusBadge label="Owner" />
                    </div>
                  ) : (
                    <details>
                      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{person.name}</span>
                        <span className="text-sm text-muted">{person.email}</span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        <ActionForm
                          action={setWorkerPassword}
                          submitLabel="Set new password" pendingLabel="Setting…"
                          savedMessage="Password set. Give it to them."
                          resetOnSave
                        >
                          <input type="hidden" name="userId" value={person.userId} />
                          <FormField label="New password" name="password" autoComplete="off" minLength={8} required />
                        </ActionForm>
                        <ActionForm action={removeWorker} submitLabel="Remove from team" pendingLabel="Removing…" subtle>
                          <input type="hidden" name="userId" value={person.userId} />
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Add someone">
            <ActionForm action={addWorker} submitLabel="Add to team" pendingLabel="Adding…" resetOnSave>
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField label="Name" name="name" autoComplete="off" required />
                <FormField label="Email" name="email" type="email" autoComplete="off" required />
                <FormField label="Password" name="password" autoComplete="off" minLength={8} required />
              </div>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}

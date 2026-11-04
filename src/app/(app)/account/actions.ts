"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { getMember, getWorkshop } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_PASSWORD_LENGTH = 8;
const NOT_ALLOWED = "Only the workshop owner can do this.";
const PASSWORD_TOO_SHORT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

function text(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}

function saved(): ActionResult {
  revalidatePath("/account");
  return { savedAt: Date.now() };
}

/** The row check limits this to the caller's own workshop, so another workshop's id finds nothing. */
async function isWorker(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workshop_members")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "worker")
    .maybeSingle();
  return data !== null;
}

export async function changePassword(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const password = String(data.get("password") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) return { error: PASSWORD_TOO_SHORT };
  if (password !== data.get("confirm")) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error?.code === "same_password") return { error: "That is already your password." };
  return error ? { error: "Could not change your password." } : saved();
}

export async function addWorker(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const member = await getMember();
  if (member.role !== "owner") return { error: NOT_ALLOWED };

  const name = text(data, "name");
  const email = text(data, "email");
  const password = String(data.get("password") ?? "");

  if (!name) return { error: "Add their name." };
  if (!email) return { error: "Add their email." };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: PASSWORD_TOO_SHORT };

  const workshop = await getWorkshop();
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (error?.code === "email_exists") return { error: "That email already has an account." };
  if (error) return { error: "Could not add this person. Check the email." };

  const { error: memberError } = await admin
    .from("workshop_members")
    .insert({ workshop_id: workshop.id, user_id: created.user.id, role: "worker" });

  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Could not add this person." };
  }

  return saved();
}

export async function setWorkerPassword(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const member = await getMember();
  const userId = text(data, "userId");
  const password = String(data.get("password") ?? "");

  if (member.role !== "owner" || !(await isWorker(userId))) return { error: NOT_ALLOWED };
  if (password.length < MIN_PASSWORD_LENGTH) return { error: PASSWORD_TOO_SHORT };

  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  return error ? { error: "Could not set the password." } : saved();
}

export async function removeWorker(_state: ActionResult, data: FormData): Promise<ActionResult> {
  const member = await getMember();
  const userId = text(data, "userId");

  if (member.role !== "owner" || !(await isWorker(userId))) return { error: NOT_ALLOWED };

  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  return error ? { error: "Could not remove this person." } : saved();
}

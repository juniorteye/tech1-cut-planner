"use server";

import { redirect } from "next/navigation";
import { landingPath } from "@/lib/supabase/landing-path";
import { createClient } from "@/lib/supabase/server";

export type WorkshopState = {
  error?: string;
};

export async function createWorkshop(
  _state: WorkshopState,
  formData: FormData,
): Promise<WorkshopState> {
  const name = String(formData.get("name") ?? "").trim();
  const supabase = await createClient();

  if ((await landingPath(supabase)) === "/") {
    redirect("/");
  }

  const { error } = await supabase.rpc("create_workshop", { workshop_name: name });

  if (error) {
    return { error: "We could not create your workshop. Please try again." };
  }

  redirect("/setup");
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { landingPath } from "@/lib/supabase/landing-path";
import { createClient } from "@/lib/supabase/server";

export type AuthState = {
  error?: string;
  message?: string;
  email?: string;
};

export async function authenticate(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();

  if (formData.get("intent") === "forgot") {
    if (!email) {
      return { error: "Type your email first." };
    }

    const origin = (await headers()).get("origin");
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/account`,
    });
    return {
      message: "If that email has an account, a link to set a new password is on its way.",
      email,
    };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "That email or password is not right.", email };
  }

  redirect(await landingPath(supabase));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

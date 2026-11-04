import type { SupabaseClient } from "@supabase/supabase-js";

/** Where a logged-in user belongs: first-time users still need a workshop. */
export async function landingPath(supabase: SupabaseClient) {
  const { data } = await supabase.from("workshop_members").select("workshop_id").limit(1);
  return data && data.length > 0 ? "/" : "/welcome";
}

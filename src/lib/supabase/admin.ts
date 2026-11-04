import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Uses the secret key, so it skips every row check. Only the team actions may use it. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

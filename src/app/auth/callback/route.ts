import { NextResponse, type NextRequest } from "next/server";
import { landingPath } from "@/lib/supabase/landing-path";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const path = searchParams.get("next") === "/account" ? "/account" : await landingPath(supabase);
      return NextResponse.redirect(new URL(path, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

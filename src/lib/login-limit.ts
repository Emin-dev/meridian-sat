import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Fails closed if the reviewed database migration has not been applied. */
export async function guardLogin(kind: "admin" | "student"): Promise<NextResponse | null> {
  const { data, error } = await getSupabaseAdmin().rpc("consume_login_attempt", { p_kind: kind });
  if (error || typeof data !== "boolean") {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
  return data ? null : NextResponse.json({ error: "Too many sign-in attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": "900" } });
}

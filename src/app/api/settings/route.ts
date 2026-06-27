import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

// GET /api/settings -> all settings as key/value
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("settings").select("*");
    if (error) return apiError("settings", error, 500);
    const map: Record<string, string> = {};
    (data || []).forEach((r) => (map[r.key] = r.value));
    return NextResponse.json({ settings: map });
  } catch (err) {
    return apiError("settings", err);
  }
}

// PATCH /api/settings -> update a setting (admin)
export async function PATCH(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { key, value } = await req.json();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) return apiError("settings", error, 500);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("settings", err);
  }
}

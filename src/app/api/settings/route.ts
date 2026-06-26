import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/settings -> all settings as key/value
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("settings").select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const map: Record<string, string> = {};
    (data || []).forEach((r) => (map[r.key] = r.value));
    return NextResponse.json({ settings: map });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/settings -> update a setting (admin)
export async function PATCH(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("settings")
      .upsert({ key, value }, { onConflict: "key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

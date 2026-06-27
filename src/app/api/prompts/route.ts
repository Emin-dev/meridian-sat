import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";

// GET /api/prompts -> all editable AI prompts (admin)
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("prompts").select("*").order("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prompts: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/prompts -> update one prompt's content (admin controls the AI)
export async function PATCH(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { id, content, label } = await req.json();
    const supabase = getSupabaseAdmin();
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (content !== undefined) update.content = content;
    if (label !== undefined) update.label = label;
    const { data, error } = await supabase
      .from("prompts")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ prompt: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

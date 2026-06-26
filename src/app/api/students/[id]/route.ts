import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// PATCH /api/students/:id -> update a student (admin can edit everything)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const update: Record<string, any> = {};
    for (const k of [
      "name",
      "access_code",
      "grade",
      "target_score",
      "weak_areas",
      "notes",
      "onboarded",
      "survey",
      "study_plan",
      "ai_summary",
    ]) {
      if (k in body) update[k] = body[k];
    }
    const { data, error } = await supabase
      .from("students")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ student: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/students/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("students").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

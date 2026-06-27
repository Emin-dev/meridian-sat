import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";

// GET /api/students/:id -> a single student record (used by the student app to
// load only its OWN record, instead of downloading the whole roster).
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ student: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/students/:id -> update a student (admin can edit everything)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Students may update their OWN lifecycle fields during onboarding (no admin
  // token); broader edits require admin. We allow the PATCH but restrict which
  // fields a non-admin can change.
  const isAdmin = !requireAdmin(req);
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
      "status",
      "survey",
      "study_plan",
      "ai_summary",
      "labels",
      "insights",
      "recommendations",
    ]) {
      if (k in body) update[k] = body[k];
    }
    // A non-admin (the student themselves) may only touch onboarding lifecycle
    // fields. Strip everything else to prevent tampering with another's record
    // or escalating their own profile.
    if (!isAdmin) {
      const allowed = new Set(["onboarded", "status", "survey"]);
      for (const k of Object.keys(update)) {
        if (!allowed.has(k)) delete update[k];
      }
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

// DELETE /api/students/:id (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("students").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

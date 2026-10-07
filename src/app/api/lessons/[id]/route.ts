import { requireStudent } from "@/lib/studentauth";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

// GET /api/lessons/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (requireAdmin(req) && !req.headers.get("x-student-token")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", (await params).id)
      .single();
    if (error) return apiError("lessons/[id]", error, 404);
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const unauth = await requireStudent(req, data.student_id);
    if (unauth) return unauth;
    if (requireAdmin(req) && data.status !== "published") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ lesson: data });
  } catch (err) {
    return apiError("lessons/[id]", err);
  }
}

// PATCH /api/lessons/:id -> admin edits everything students see
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const update: Record<string, any> = {};
    for (const k of [
      "title",
      "section",
      "topic",
      "difficulty",
      "content",
      "questions",
      "study_plan",
      "status",
    ]) {
      if (k in body) update[k] = body[k];
    }
    const { data, error } = await supabase
      .from("lessons")
      .update(update)
      .eq("id", (await params).id)
      .select()
      .single();
    if (error) return apiError("lessons/[id]", error, 500);
    return NextResponse.json({ lesson: data });
  } catch (err) {
    return apiError("lessons/[id]", err);
  }
}

// DELETE /api/lessons/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("lessons").delete().eq("id", (await params).id);
    if (error) return apiError("lessons/[id]", error, 500);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("lessons/[id]", err);
  }
}

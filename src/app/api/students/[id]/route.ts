import { studentView } from "@/lib/student-view";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, ok, parseJsonBody } from "@/lib/api";

// GET /api/students/:id -> a single student record. The student app loads only
// its OWN record; requireStudent ensures the caller owns this id (admins allowed).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireStudent(req, (await params).id);
  if (unauth) return unauth;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", (await params).id)
      .maybeSingle();
    if (error) return apiError("students/[id]:GET", error);
    if (!data) return apiError("students/[id]:GET", "not found", 404, "Not found.");
    return ok({ student: !requireAdmin(req) ? data : studentView(data) });
  } catch (err) {
    return apiError("students/[id]:GET", err);
  }
}

// PATCH /api/students/:id -> update a student.
// Teacher-only edits. Student onboarding uses its own atomic transition endpoint.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = await requireStudent(req, (await params).id);
  if (unauth) return unauth;
  const isAdmin = !requireAdmin(req);
  if (!isAdmin) return apiError("students/[id]:PATCH", "forbidden", 403, "Only your tutor can update this record.");
  try {
    const body = await parseJsonBody<Record<string, any>>(req);
    if (!body) return apiError("students/[id]:PATCH", "bad body", 400, "Invalid request.");
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
      "tags",
      "insights",
      "recommendations",
    ]) {
      if (k in body) update[k] = body[k];
    }
    // Onboarding is a single controlled transition in /api/onboarding.
    // Students cannot activate themselves or alter teacher-managed fields.
    const { data, error } = await supabase
      .from("students")
      .update(update)
      .eq("id", (await params).id)
      .select()
      .single();
    if (error) return apiError("students/[id]:PATCH", error);
    return ok({ student: !requireAdmin(req) ? data : studentView(data) });
  } catch (err) {
    return apiError("students/[id]:PATCH", err);
  }
}

// DELETE /api/students/:id (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("students").delete().eq("id", (await params).id);
    if (error) return apiError("students/[id]:DELETE", error);
    return ok({ ok: true });
  } catch (err) {
    return apiError("students/[id]:DELETE", err);
  }
}

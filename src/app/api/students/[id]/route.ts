import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, ok, parseJsonBody } from "@/lib/api";

// GET /api/students/:id -> a single student record. The student app loads only
// its OWN record; requireStudent ensures the caller owns this id (admins allowed).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauth = requireStudent(req, params.id);
  if (unauth) return unauth;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) return apiError("students/[id]:GET", error);
    if (!data) return apiError("students/[id]:GET", "not found", 404, "Not found.");
    return ok({ student: data });
  } catch (err) {
    return apiError("students/[id]:GET", err);
  }
}

// PATCH /api/students/:id -> update a student.
// Admins can edit everything. The student themselves may only change onboarding
// lifecycle fields on their OWN record (requireStudent gates ownership).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauth = requireStudent(req, params.id);
  if (unauth) return unauth;
  const isAdmin = !requireAdmin(req);
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
      "insights",
      "recommendations",
    ]) {
      if (k in body) update[k] = body[k];
    }
    // A non-admin (the student) may only touch onboarding lifecycle fields.
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
    if (error) return apiError("students/[id]:PATCH", error);
    return ok({ student: data });
  } catch (err) {
    return apiError("students/[id]:PATCH", err);
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
    if (error) return apiError("students/[id]:DELETE", error);
    return ok({ ok: true });
  } catch (err) {
    return apiError("students/[id]:DELETE", err);
  }
}

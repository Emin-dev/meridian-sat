import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, badRequest, ok, parseJsonBody, reqId } from "@/lib/api";

// GET /api/progress?studentId=...  -> progress rows for one student.
// Caller must own the id (or be admin). Without a studentId, admin only.
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (studentId) {
    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;
  } else {
    const unauth = requireAdmin(req);
    if (unauth) return unauth;
  }
  try {
    const supabase = getSupabaseAdmin();
    let q = supabase.from("progress").select("*");
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return apiError("progress:GET", error);
    return ok({ progress: data });
  } catch (err) {
    return apiError("progress:GET", err);
  }
}

// POST /api/progress -> upsert a student's result on a lesson.
// The caller must own the student_id they are writing for (or be admin).
export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody<any>(req);
    if (!body) return badRequest("Invalid request.");
    const studentId = reqId(body.student_id);
    if (!studentId) return badRequest("A valid student_id is required.");

    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;

    const supabase = getSupabaseAdmin();

    // does a row already exist?
    const { data: existing } = await supabase
      .from("progress")
      .select("id")
      .eq("student_id", studentId)
      .eq("lesson_id", body.lesson_id)
      .maybeSingle();

    const payload = {
      student_id: studentId,
      lesson_id: body.lesson_id,
      completed: body.completed ?? true,
      score: body.score ?? null,
      total_q: body.total_q ?? 0,
      correct_q: body.correct_q ?? 0,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      result = await supabase
        .from("progress")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase.from("progress").insert(payload).select().single();
    }
    if (result.error) return apiError("progress:POST", result.error);
    return ok({ progress: result.data });
  } catch (err) {
    return apiError("progress:POST", err);
  }
}

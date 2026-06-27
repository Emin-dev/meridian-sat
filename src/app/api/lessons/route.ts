import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, ok, parseJsonBody } from "@/lib/api";

// GET /api/lessons?studentId=...  -> lessons for a student.
// With a studentId, the caller must own that id (or be admin). Without one
// (admin listing every lesson), an admin token is required.
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
    let q = supabase.from("lessons").select("*").order("created_at", { ascending: false });
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return apiError("lessons:GET", error);
    return ok({ lessons: data });
  } catch (err) {
    return apiError("lessons:GET", err);
  }
}

// POST /api/lessons -> create a lesson manually (admin)
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await parseJsonBody<any>(req);
    if (!body) return apiError("lessons:POST", "bad body", 400, "Invalid request.");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        student_id: body.student_id,
        title: body.title,
        section: body.section,
        topic: body.topic,
        difficulty: body.difficulty || "medium",
        content: body.content || "",
        questions: body.questions || [],
        study_plan: body.study_plan || "",
        status: body.status || "published",
      })
      .select()
      .single();
    if (error) return apiError("lessons:POST", error);
    return ok({ lesson: data });
  } catch (err) {
    return apiError("lessons:POST", err);
  }
}

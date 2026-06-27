import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, ok } from "@/lib/api";

// GET /api/student-tools?status=pending     -> all proposals (admin queue)
// GET /api/student-tools?studentId=...       -> tools for one student
// GET /api/student-tools?studentId=...&status=approved -> only what a student sees
//
// Joined with the student's name for the admin review queue.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const studentId = searchParams.get("studentId");
  // A student may only read their OWN tools; the admin queue (no studentId, or
  // status=pending) requires an admin token.
  if (studentId) {
    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;
  } else {
    const unauth = requireAdmin(req);
    if (unauth) return unauth;
  }
  try {
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("student_tools")
      .select("*, students(name, access_code, status)")
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (studentId) q = q.eq("student_id", studentId);

    const { data, error } = await q;
    if (error) return apiError("student-tools:GET", error);
    return ok({ tools: data || [] });
  } catch (err) {
    return apiError("student-tools:GET", err);
  }
}

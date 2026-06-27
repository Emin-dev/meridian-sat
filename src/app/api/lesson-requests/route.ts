import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";

// GET /api/lesson-requests?status=pending          -> all requests (admin queue)
// GET /api/lesson-requests?studentId=...           -> requests for one student
// Returns requests joined with the student's name for the admin review queue.
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const studentId = searchParams.get("studentId");
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("lesson_requests")
      .select("*, students(name, access_code, status)")
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (studentId) q = q.eq("student_id", studentId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ requests: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

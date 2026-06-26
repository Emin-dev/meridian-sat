import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/student-tools?status=pending     -> all proposals (admin queue)
// GET /api/student-tools?studentId=...       -> tools for one student
// GET /api/student-tools?studentId=...&status=approved -> only what a student sees
//
// Joined with the student's name for the admin review queue.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const studentId = searchParams.get("studentId");
    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("student_tools")
      .select("*, students(name, access_code, status)")
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (studentId) q = q.eq("student_id", studentId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tools: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

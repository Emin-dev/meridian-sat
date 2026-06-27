import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete } from "@/lib/deepseek";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 45;

// POST /api/ai/summarize  body: { studentId }
// Auto-writes a progress note/summary for a student from their lessons + scores.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { studentId } = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: student } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const { data: lessons } = await supabase
      .from("lessons")
      .select("title, section, topic, difficulty")
      .eq("student_id", studentId);
    const { data: progress } = await supabase
      .from("progress")
      .select("score, completed, correct_q, total_q")
      .eq("student_id", studentId);

    const system =
      "You are an SAT tutor writing a concise private progress note for the instructor. Be specific and actionable. Plain text, 3-5 sentences. No preamble.";
    const user = `Student: ${student.name} (target ${student.target_score}).
Weak areas: ${(student.weak_areas || []).join(", ") || "none recorded"}.
Lessons assigned: ${JSON.stringify(lessons || [])}.
Practice results: ${JSON.stringify(progress || [])}.
Write a progress summary note.`;

    const summary = await aiComplete(system, user, { temperature: 0.5 });
    return NextResponse.json({ summary: summary.trim() });
  } catch (err) {
    return apiError("ai/summarize", err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import { summarizeEvents, quickLabel } from "@/lib/insights";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 60;

// POST /api/ai/insights
// body: { studentId }
//
// The invisible "knows what's going on" engine for the ADMIN. Reads a student's
// activity log + progress, computes hard numbers, then asks the model to turn
// them into: labels, a few key points the teacher should know, and concrete
// recommendations / next actions. Persists the result on the student row so the
// admin list is instant afterward.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { studentId } = await req.json();
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();

    const [{ data: student }, { data: events }, { data: progress }, { data: lessons }] =
      await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase
          .from("events")
          .select("type, duration_ms, meta, created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("progress").select("*").eq("student_id", studentId),
        supabase.from("lessons").select("id, title, topic, section").eq("student_id", studentId),
      ]);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const breakdown = summarizeEvents(events || []);
    const quick = quickLabel(breakdown);

    const completed = (progress || []).filter((p: any) => p.completed).length;
    const scored = (progress || []).filter((p: any) => p.score != null);
    const avgScore = scored.length
      ? Math.round(
          scored.reduce((a: number, p: any) => a + (p.score || 0), 0) /
            scored.length
        )
      : null;

    const facts = {
      name: student.name,
      target_score: student.target_score,
      weak_areas: student.weak_areas,
      total_study_minutes: Math.round(breakdown.totalSeconds / 60),
      reading_minutes: Math.round(breakdown.readingSeconds / 60),
      practice_minutes: Math.round(breakdown.practiceSeconds / 60),
      exam_minutes: Math.round(breakdown.examSeconds / 60),
      lessons_total: (lessons || []).length,
      lessons_opened: breakdown.lessonsOpened,
      lessons_completed: completed,
      practice_answered: breakdown.practiceAnswered,
      practice_accuracy: breakdown.practiceAnswered
        ? Math.round((breakdown.practiceCorrect / breakdown.practiceAnswered) * 100)
        : null,
      avg_quiz_score: avgScore,
      study_sessions: breakdown.sessions,
      days_since_active: breakdown.daysSinceActive,
      streak_days: student.streak_days,
    };

    const system =
      "You are an attentive tutor's assistant. From a student's real study activity you produce a short, honest read for their human teacher. Be specific and actionable. Return valid JSON only.";
    const user = `Here are the hard numbers for this student (JSON):
${JSON.stringify(facts, null, 2)}

Return STRICT JSON:
{
  "labels": ["1-3 short status labels, e.g. 'On track', 'At risk', 'Strong in Math', 'Avoiding practice'"],
  "key_points": ["2-4 short bullet observations the teacher should know right now"],
  "recommendations": ["2-4 concrete next actions the teacher could take for this student"],
  "headline": "one short sentence summarizing this student's current state"
}`;

    let ai: any = {};
    try {
      ai = parseJsonFromModel(
        await aiComplete(system, user, { json: true, temperature: 0.4 })
      );
    } catch {
      ai = {};
    }

    const labels =
      Array.isArray(ai.labels) && ai.labels.length ? ai.labels : [quick.label];
    const insights = {
      headline: ai.headline || quick.label,
      key_points: Array.isArray(ai.key_points) ? ai.key_points : [],
      breakdown: facts,
      updated_at: new Date().toISOString(),
    };
    const recommendations = {
      items: Array.isArray(ai.recommendations) ? ai.recommendations : [],
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("students")
      .update({ labels, insights, recommendations })
      .eq("id", studentId);

    return NextResponse.json({
      labels,
      insights,
      recommendations,
      breakdown: facts,
      quickLabel: quick,
    });
  } catch (err) {
    return apiError("ai/insights", err);
  }
}

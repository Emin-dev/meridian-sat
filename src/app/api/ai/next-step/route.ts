import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import { summarizeEvents } from "@/lib/insights";
import { guardStudentAI } from "@/lib/ratelimit";

export const maxDuration = 60;

// POST /api/ai/next-step
// body: { studentId }
//
// The invisible helper for the STUDENT: based on what they've done so far, it
// returns a single, friendly "what to do next" nudge plus an optional target
// lesson to jump into. No mention of AI — it reads as gentle guidance.
export async function POST(req: NextRequest) {
  try {
    const { studentId } = await req.json();
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const { blocked } = await guardStudentAI(studentId);
    if (blocked) return blocked;
    const supabase = getSupabaseAdmin();

    const [{ data: student }, { data: events }, { data: progress }, { data: lessons }] =
      await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase
          .from("events")
          .select("type, duration_ms, meta, lesson_id, created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("progress").select("*").eq("student_id", studentId),
        supabase
          .from("lessons")
          .select("id, title, topic, section, difficulty")
          .eq("student_id", studentId)
          .eq("status", "published"),
      ]);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const breakdown = summarizeEvents(events || []);
    const doneIds = new Set(
      (progress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id)
    );
    const notDone = (lessons || []).filter((l: any) => !doneIds.has(l.id));

    // Rule-based fallback so the student always gets a sensible nudge.
    const fallbackLesson = notDone[0] || null;
    let suggestion = fallbackLesson
      ? `Pick up where you left off with “${fallbackLesson.title}”.`
      : "Great work — revisit a past lesson to keep your skills sharp.";

    try {
      const system =
        "You are a warm, encouraging study coach for one student. Suggest the single best next thing for them to do right now in 1 short friendly sentence. Never mention AI. Return JSON only.";
      const user = `Student: ${student.name}. Target: ${student.target_score}. Weak areas: ${(student.weak_areas || []).join(", ")}.
Study so far: ${Math.round(breakdown.totalSeconds / 60)} min total, ${breakdown.lessonsOpened} lessons opened, ${doneIds.size} completed, practice accuracy ${
        breakdown.practiceAnswered
          ? Math.round((breakdown.practiceCorrect / breakdown.practiceAnswered) * 100) + "%"
          : "n/a"
      }, ${breakdown.daysSinceActive ?? 0} days since last active.
Unfinished lessons: ${notDone.map((l: any) => `${l.id} | ${l.title} (${l.section})`).join("; ") || "none"}.

Return STRICT JSON:
{ "message": "one short friendly sentence telling them exactly what to do next", "lessonId": "the id of the best lesson to open next, or null" }`;
      const ai = parseJsonFromModel(
        await aiComplete(system, user, { json: true, temperature: 0.6 })
      );
      if (ai.message) suggestion = ai.message;
      const chosen =
        ai.lessonId && (lessons || []).find((l: any) => l.id === ai.lessonId);
      return NextResponse.json({
        message: suggestion,
        lessonId: chosen ? ai.lessonId : fallbackLesson?.id || null,
      });
    } catch {
      return NextResponse.json({
        message: suggestion,
        lessonId: fallbackLesson?.id || null,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "failed" },
      { status: 500 }
    );
  }
}

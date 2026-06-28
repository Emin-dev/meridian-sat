import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError, badRequest, reqId } from "@/lib/api";
import {
  generateOneLesson,
  fingerprint,
  type PlannedLesson,
} from "@/lib/bulklessongen";

// Generates ONE planned lesson (content + ~12-15 questions), grounds it 80/20 in
// the curated SAT base, randomizes answers (no-AI shuffle), runs deterministic
// quality guards, and saves it as a PUBLISHED lesson. The client orchestrator
// calls this once per lesson so every request stays under the 60s serverless
// limit and every model call stays under the token ceiling (no truncation).
export const maxDuration = 60;

// POST /api/generate-lessons-bulk/lesson
// body: { studentId, lesson: PlannedLesson, avoidPrompts?: string[], status?: "draft" | "published" }
//
// `status` controls how the generated lesson is saved:
//   - "published" (default for the admin one-click flow): visible to the student immediately.
//   - "draft": held for teacher review (used by the auto-on-login flow). Students
//     never see draft lessons (the student page filters to status === "published").
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = reqId(body.studentId);
    const lesson = body.lesson as PlannedLesson | undefined;
    const saveStatus = body.status === "draft" ? "draft" : "published";
    const avoidPrompts: string[] = Array.isArray(body.avoidPrompts)
      ? body.avoidPrompts.map(String)
      : [];

    if (!studentId) return badRequest("A valid studentId is required.");
    if (!lesson || typeof lesson !== "object" || !lesson.topic) {
      return badRequest("A valid planned lesson is required.");
    }

    const supabase = getSupabaseAdmin();
    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (sErr || !student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // Generate with a single retry — bulk jobs must be resilient to a transient
    // truncation / malformed-JSON failure on one lesson.
    let generated;
    try {
      generated = await generateOneLesson(student, lesson, avoidPrompts);
    } catch {
      generated = await generateOneLesson(student, lesson, avoidPrompts);
    }

    // Quality guard: never persist an empty lesson.
    if (!generated.questions.length) {
      return NextResponse.json(
        { error: "Lesson produced no usable questions." },
        { status: 502 }
      );
    }

    const { data: saved, error: lErr } = await supabase
      .from("lessons")
      .insert({
        student_id: studentId,
        title: generated.title,
        section: generated.section,
        topic: generated.topic,
        difficulty: generated.difficulty,
        content: generated.content,
        questions: generated.questions,
        study_plan: generated.study_plan,
        status: saveStatus,
      })
      .select()
      .single();

    if (lErr) return apiError("generate-lessons-bulk/lesson", lErr);

    // Return the lesson plus this lesson's question fingerprints so the client
    // can feed them into the next lesson's avoid-list (cross-lesson dedupe).
    const fingerprints = generated.questions.map((q) => fingerprint(q.prompt));
    const prompts = generated.questions.map((q) => q.prompt);

    return NextResponse.json({
      lesson: saved,
      questionCount: generated.questions.length,
      fingerprints,
      prompts,
    });
  } catch (err) {
    return apiError("generate-lessons-bulk/lesson", err);
  }
}

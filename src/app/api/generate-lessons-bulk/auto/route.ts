import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireStudent } from "@/lib/studentauth";
import { apiError, badRequest, reqId } from "@/lib/api";
import { buildBulkPlan, generateOneLesson } from "@/lib/bulklessongen";

// Auto-generate a fresh DRAFT lesson set so the teacher never has to wait for
// generation after deciding to review. This is the "prepare ahead" endpoint.
//
// IT GENERATES EXACTLY ONE LESSON PER CALL (chained). The student's browser
// fires it on login and re-calls it on each success until {done:true}. Lessons
// then appear one after another. Doing one small lesson per request is the key
// production-safety property:
//   - no parallelism  -> no memory blow-up / OOM crash,
//   - each request is small and fast -> comfortably inside the function limit,
//   - partial progress survives -> a failed call just retries the same lesson.
//
// Other guarantees:
//   - student-authed (requireStudent),
//   - idempotent + debounced (skips if a full draft set is already waiting or
//     one was prepared very recently),
//   - every lesson saved as status:"draft" (students never see drafts),
//   - a `lessons_ready` event is logged only when the FULL set is complete, so
//     the admin alarm fires once, when the set is actually ready to review.
// deepseek-v4-pro is a reasoning model: a single constraint-rich lesson prompt
// can spend 30-60s on hidden reasoning. One lesson per request still fits well
// inside a generous budget, so we give the function room rather than fighting
// the model. (Vercel caps this per plan; 300 is the Pro ceiling.)
export const maxDuration = 300;

// Each lesson uses the same deterministic plan, so we cap the number of lessons
// the auto flow prepares per set. Small + fast by design.
const AUTO_LESSON_COUNT = 3;
const AUTO_TOTAL_QUESTIONS = 12; // exactly 4 per lesson, generated ONE lesson per request under a 300s budget

// Debounce window: once a set is completed, don't auto-build another for a while.
const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

// POST /api/generate-lessons-bulk/auto
// body: { studentId, lessonCount?, totalQuestions? }
// Generates the NEXT missing draft lesson and returns progress:
//   { ok, done, generated, total, lesson? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const studentId = reqId(body.studentId);
    if (!studentId) return badRequest("A valid studentId is required.");

    // Authorize: only the student themselves (or an admin) can trigger this.
    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;

    const lessonCount = Math.max(
      3,
      Math.min(5, Number(body.lessonCount) || AUTO_LESSON_COUNT)
    );
    const totalQuestions = Math.max(
      lessonCount,
      Number(body.totalQuestions) || AUTO_TOTAL_QUESTIONS
    );

    const supabase = getSupabaseAdmin();

    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (sErr || !student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // Build the deterministic plan. The number of draft lessons already on the
    // student tells us how far the chain has progressed.
    const plan = buildBulkPlan(student as any, { lessonCount, totalQuestions });
    const total = plan.lessons.length;

    // Count existing DRAFT lessons (the chain's progress so far).
    const { data: drafts } = await supabase
      .from("lessons")
      .select("id")
      .eq("student_id", studentId)
      .eq("status", "draft");
    const draftCount = drafts?.length || 0;

    // ---- Set already complete: nothing to do. -----------------------------
    if (draftCount >= total) {
      return NextResponse.json({
        ok: true,
        done: true,
        generated: draftCount,
        total,
        skipped: "set-complete",
      });
    }

    // ---- Debounce: only gate the START of a new chain (draftCount === 0). --
    // Once a chain is in progress (draftCount > 0) we always continue it so it
    // can finish; the cooldown only prevents kicking off a brand-new set right
    // after one was completed.
    if (draftCount === 0) {
      const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const { data: recent } = await supabase
        .from("events")
        .select("type, created_at")
        .eq("student_id", studentId)
        .eq("type", "lessons_ready")
        .gte("created_at", since)
        .limit(1);
      if (recent && recent.length > 0) {
        return NextResponse.json({
          ok: true,
          done: true,
          generated: 0,
          total,
          skipped: "cooldown",
        });
      }
    }

    // ---- Generate the NEXT missing lesson (one per call). ------------------
    const planned = plan.lessons[draftCount];

    // NO inline retry here: a single generateOneLesson can take ~30s, so an
    // inline retry risks blowing the 60s function budget. If it fails, we return
    // a fast error and the client chain simply re-calls this endpoint, which
    // regenerates the SAME missing lesson on a fresh request budget.
    let generated;
    try {
      generated = await generateOneLesson(student as any, planned, []);
    } catch (e) {
      return NextResponse.json(
        { ok: false, done: false, generated: draftCount, total, retry: true,
          error: "Lesson generation failed; retry." },
        { status: 503 }
      );
    }

    if (!generated.questions.length) {
      return NextResponse.json(
        { ok: false, error: "Lesson produced no usable questions." },
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
        status: "draft",
      })
      .select("id, title")
      .single();
    if (lErr || !saved) {
      return apiError("generate-lessons-bulk/auto", lErr || "insert failed");
    }

    const newCount = draftCount + 1;
    const done = newCount >= total;

    // ---- Raise the review alarm ONCE, when the full set is complete. -------
    if (done) {
      await supabase.from("events").insert({
        student_id: studentId,
        type: "lessons_ready",
        meta: { count: newCount, questions: totalQuestions },
        duration_ms: 0,
      });
    }

    return NextResponse.json({
      ok: true,
      done,
      generated: newCount,
      total,
      lesson: { id: saved.id, title: saved.title, questions: generated.questions.length },
    });
  } catch (err) {
    return apiError("generate-lessons-bulk/auto", err);
  }
}

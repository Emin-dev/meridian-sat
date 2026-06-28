import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError, badRequest, reqId } from "@/lib/api";
import { buildBulkPlan } from "@/lib/bulklessongen";

// Fast planning step for the one-click bulk lesson-set generator.
// Returns a coverage BLUEPRINT — distinct (skill x difficulty) slots allocated
// across 3-5 lessons totalling 50+ questions — WITHOUT generating any questions.
// This is the anti-duplication + progress-UX foundation the model council
// converged on: the client shows the plan instantly, then drives one
// per-lesson generation call at a time.
export const maxDuration = 30;

// POST /api/generate-lessons-bulk/plan
// body: { studentId, lessonCount?(3-5), totalQuestions?(>=50) }
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json().catch(() => ({}));
    const studentId = reqId(body.studentId);
    if (!studentId) return badRequest("A valid studentId is required.");

    const lessonCount = Number(body.lessonCount) || 4;
    const totalQuestions = Number(body.totalQuestions) || 52;

    const supabase = getSupabaseAdmin();
    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (sErr || !student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const plan = buildBulkPlan(student, { lessonCount, totalQuestions });
    return NextResponse.json({ plan });
  } catch (err) {
    return apiError("generate-lessons-bulk/plan", err);
  }
}

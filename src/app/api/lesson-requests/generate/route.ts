import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateDraftPackage, fallbackPackage } from "@/lib/lessongen";
import { requireAdmin } from "@/lib/adminauth";

export const maxDuration = 60;

// POST /api/lesson-requests/generate
// body: { studentId }
//
// Recovery / manual-trigger endpoint. Builds (or rebuilds) a PENDING lesson
// request for a student so the teacher always has something to review and
// approve. This is the safety net for first-login students whose initial
// package failed to generate during onboarding (e.g. an AI timeout), which
// would otherwise leave them stuck in the "preparing" state with nothing in
// the admin review queue.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { studentId } = await req.json();
    if (!studentId) {
      return NextResponse.json(
        { error: "studentId is required." },
        { status: 400 }
      );
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

    // If there is already a pending request, don't create a duplicate.
    const { data: existing } = await supabase
      .from("lesson_requests")
      .select("id")
      .eq("student_id", studentId)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({
        request: { id: existing[0].id },
        reused: true,
      });
    }

    const answers = student.survey || {};

    // Try the full AI package first; fall back to a minimal but valid package
    // so a request is ALWAYS filed and the teacher can approve.
    let pkg;
    let usedFallback = false;
    try {
      pkg = await generateDraftPackage(student, answers, { lessonCount: 4 });
      if (!Array.isArray(pkg.lessons) || pkg.lessons.length === 0) {
        throw new Error("Empty package");
      }
    } catch (genErr: any) {
      usedFallback = true;
      pkg = fallbackPackage(student);
    }

    const { data: created, error: cErr } = await supabase
      .from("lesson_requests")
      .insert({
        student_id: studentId,
        status: "pending",
        study_plan: pkg.study_plan,
        ai_summary: pkg.ai_summary,
        lessons: pkg.lessons,
        notes: pkg.notes,
        version: 1,
        feedback: "",
        discussion: [],
      })
      .select()
      .single();
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }

    // Keep the AI-derived profile fresh on the student record.
    await supabase
      .from("students")
      .update({
        weak_areas: pkg.weak_areas?.length
          ? pkg.weak_areas
          : student.weak_areas || [],
        target_score: pkg.target_score || student.target_score || 1400,
        notes: pkg.notes || student.notes || "",
        status: "preparing",
      })
      .eq("id", studentId);

    return NextResponse.json({ request: created, usedFallback });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Generation failed." },
      { status: 500 }
    );
  }
}

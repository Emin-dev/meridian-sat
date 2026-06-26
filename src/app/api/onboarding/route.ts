import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateDraftPackage } from "@/lib/lessongen";

export const maxDuration = 60;

// POST /api/onboarding
// body: { studentId, answers }
//
// New workflow: the student finishes the survey, we immediately move them into
// the LOCKED "preparing" state and save their answers. In the background we ask
// the model to build a full personalized package (study plan + first lessons)
// and file it as a PENDING lesson_request for the teacher to review. Nothing is
// published to the student until a teacher approves it.
export async function POST(req: NextRequest) {
  try {
    const { studentId, answers } = await req.json();
    if (!studentId || !answers) {
      return NextResponse.json(
        { error: "studentId and answers are required." },
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

    // 1) Lock the student: survey saved, status = preparing. They now wait.
    const { data: locked, error: lockErr } = await supabase
      .from("students")
      .update({
        onboarded: true,
        status: "preparing",
        survey: answers,
      })
      .eq("id", studentId)
      .select()
      .single();
    if (lockErr) {
      return NextResponse.json({ error: lockErr.message }, { status: 500 });
    }

    // 2) Build the first draft package and file it for teacher review.
    //    Done inline (within the function's 60s budget) so the request reliably
    //    lands even on serverless; the student is already locked regardless.
    try {
      const pkg = await generateDraftPackage(student, answers, {
        lessonCount: 4,
      });
      await supabase.from("lesson_requests").insert({
        student_id: studentId,
        status: "pending",
        study_plan: pkg.study_plan,
        ai_summary: pkg.ai_summary,
        lessons: pkg.lessons,
        notes: pkg.notes,
        version: 1,
        feedback: "",
        discussion: [],
      });
      // Stash AI-derived profile on the student (private; not yet shown to them).
      await supabase
        .from("students")
        .update({
          weak_areas: pkg.weak_areas.length
            ? pkg.weak_areas
            : student.weak_areas || [],
          target_score: pkg.target_score || student.target_score || 1400,
          notes: pkg.notes || student.notes || "",
        })
        .eq("id", studentId);
    } catch (genErr: any) {
      // If generation fails, the student stays "preparing"; the teacher can
      // trigger generation manually from the review screen. Don't fail the
      // student's request — they've completed their part.
      console.error("Draft generation failed:", genErr?.message);
    }

    return NextResponse.json({ student: locked });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Onboarding failed." },
      { status: 500 }
    );
  }
}

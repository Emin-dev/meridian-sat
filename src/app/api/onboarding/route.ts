import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";

export const maxDuration = 60;

// POST /api/onboarding
// body: { studentId, answers: { goal, timeline, confidence, strengths, weaknesses, hours, ... } }
// AI turns the survey into a full profile: weak areas, notes, target score, study plan, summary.
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

    const system =
      "You are an expert SAT advisor. From a student's onboarding survey you build an accurate, encouraging study profile. Follow the official Digital SAT structure (Reading and Writing, Math; 200-800 each, 400-1600 total). Always return valid JSON only.";

    const user = `Student name: ${student.name}. Grade: ${student.grade || "unknown"}.
Here are their onboarding survey answers (JSON):
${JSON.stringify(answers, null, 2)}

Based on this, return STRICT JSON with this exact shape:
{
  "weak_areas": ["3-6 specific SAT topics this student should focus on, e.g. 'Linear equations', 'Command of evidence'"],
  "target_score": 1400,  // a realistic but motivating total SAT target (400-1600) based on their goal and self-assessment
  "notes": "2-4 sentence private note for the tutor summarizing this student's situation, goals, and what to watch for",
  "ai_summary": "1-2 friendly sentences the student will see welcoming them and naming their focus areas",
  "study_plan": "a personalized markdown study plan (use ## headings and bullet lists) spanning the student's available timeline, focused on their weak areas and weekly study hours"
}`;

    const raw = await aiComplete(system, user, { json: true, temperature: 0.6 });
    const profile = parseJsonFromModel(raw);

    const { data: updated, error: uErr } = await supabase
      .from("students")
      .update({
        onboarded: true,
        survey: answers,
        weak_areas: profile.weak_areas || student.weak_areas || [],
        target_score: profile.target_score || student.target_score || 1400,
        notes: profile.notes || student.notes || "",
        ai_summary: profile.ai_summary || "",
        study_plan: profile.study_plan || "",
      })
      .eq("id", studentId)
      .select()
      .single();

    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 500 });
    }

    return NextResponse.json({ student: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Onboarding failed." },
      { status: 500 }
    );
  }
}

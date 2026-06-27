import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  getDeepSeek,
  DEEPSEEK_MODEL,
  fillTemplate,
  parseJsonFromModel,
} from "@/lib/deepseek";
import { MATH_AUTHORING } from "@/lib/mathprompt";

export const maxDuration = 60; // allow time for the model

// POST /api/generate-lesson
// body: { studentId, section, topic, difficulty }
// Generates a personalized lesson with DeepSeek V4 Pro and saves it.
export async function POST(req: NextRequest) {
  try {
    const { studentId, section, topic, difficulty } = await req.json();
    if (!studentId || !section || !topic) {
      return NextResponse.json(
        { error: "studentId, section and topic are required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Load student for personalization
    const { data: student, error: sErr } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .single();
    if (sErr || !student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // Load admin-editable prompts
    const { data: prompts } = await supabase
      .from("prompts")
      .select("*")
      .in("id", ["lesson_system", "lesson_user"]);
    const systemP = prompts?.find((p) => p.id === "lesson_system")?.content || "";
    const userTpl = prompts?.find((p) => p.id === "lesson_user")?.content || "";

    const userPrompt = fillTemplate(userTpl, {
      student_name: student.name,
      grade: student.grade || "unknown",
      target_score: String(student.target_score ?? 1400),
      weak_areas: (student.weak_areas || []).join(", ") || "none specified",
      section,
      topic,
      difficulty: difficulty || "medium",
    });

    const client = getDeepSeek();
    const completion = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: `${systemP}\n\n${MATH_AUTHORING}` },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = parseJsonFromModel(raw);

    const { data: lesson, error: lErr } = await supabase
      .from("lessons")
      .insert({
        student_id: studentId,
        title: parsed.title || `${topic} — ${section}`,
        section,
        topic,
        difficulty: difficulty || "medium",
        content: parsed.content || "",
        questions: parsed.questions || [],
        study_plan: parsed.study_plan || "",
        status: "published",
      })
      .select()
      .single();

    if (lErr) {
      return NextResponse.json({ error: lErr.message }, { status: 500 });
    }

    return NextResponse.json({ lesson });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to generate lesson." },
      { status: 500 }
    );
  }
}

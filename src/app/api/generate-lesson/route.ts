import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  chatComplete,
  fillTemplate,
  parseJsonFromModel,
} from "@/lib/deepseek";
import { MATH_AUTHORING } from "@/lib/mathprompt";
import { selectCuratedSources, renderSourcePack } from "@/lib/satcontent";
import { shuffleQuestions } from "@/lib/shuffle";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 60; // allow time for the model

// POST /api/generate-lesson
// body: { studentId, section, topic, difficulty }
// Generates a personalized lesson with DeepSeek V4 Pro and saves it.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

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

    // Ground the lesson in vetted curated SAT material (the "80%"). Bias the
    // retrieval to the topic + this student's weak areas so the model adapts
    // verified concepts/worked examples rather than inventing SAT rules.
    const sources = selectCuratedSources(
      [topic, ...(student.weak_areas || [])],
      { limit: 4 }
    );
    const sourcePack = renderSourcePack(sources);
    const groundedUser = sourcePack
      ? `${userPrompt}\n\nAPPROVED SOURCE MATERIAL — ground this lesson in these vetted SAT concepts and worked examples (reuse/adapt this substance, ~80%; do not contradict it):\n${sourcePack}`
      : userPrompt;

    const raw =
      (await chatComplete(
        [
          { role: "system", content: `${systemP}\n\n${MATH_AUTHORING}` },
          { role: "user", content: groundedUser },
        ],
        // Reasoning model spends hidden tokens before the visible answer; give
        // generous headroom so a single rich lesson never truncates to empty.
        { json: true, temperature: 0.7, maxTokens: 12000 }
      )) || "{}";
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
        // Randomize answer order with a real RNG (no AI) so the correct choice
        // isn't always the same letter and orders differ across questions.
        questions: shuffleQuestions(
          Array.isArray(parsed.questions) ? parsed.questions : [],
          `${parsed.title || topic}#${section}#${Date.now()}`
        ),
        study_plan: parsed.study_plan || "",
        status: "published",
      })
      .select()
      .single();

    if (lErr) {
      return apiError("generate-lesson", lErr);
    }

    return NextResponse.json({ lesson });
  } catch (err) {
    return apiError("generate-lesson", err);
  }
}

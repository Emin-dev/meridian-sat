import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import type { Student } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Draft package generation
// ---------------------------------------------------------------------------
// Builds the full personalized package a teacher reviews before it reaches the
// student: study plan + an initial set of lessons + a private tutor note +
// a short welcome summary. Used by onboarding and by the regenerate flow.
// ---------------------------------------------------------------------------

export type DraftPackage = {
  study_plan: string;
  ai_summary: string;
  notes: string;
  weak_areas: string[];
  target_score: number;
  lessons: {
    title: string;
    section: string;
    topic: string;
    difficulty: string;
    content: string;
    questions: {
      prompt: string;
      choices: string[];
      answer: string;
      explanation: string;
    }[];
    study_plan: string;
  }[];
};

const SYSTEM = `You are an expert SAT tutor who designs fully personalized study programs for individual students.
You follow the official Digital SAT structure: two sections — "Reading and Writing" and "Math" — each scored 200-800 for a 400-1600 total.
You write warm, clear, encouraging material. You ALWAYS return valid JSON only, with no commentary or code fences.`;

function buildUserPrompt(
  student: Student,
  answers: Record<string, any>,
  opts: { feedback?: string; previous?: any; lessonCount: number }
): string {
  const parts: string[] = [];
  parts.push(`Student name: ${student.name}. Grade: ${student.grade || "unknown"}.`);
  parts.push(`Onboarding survey answers (JSON):\n${JSON.stringify(answers, null, 2)}`);

  if (opts.previous) {
    parts.push(
      `\nThis is a REVISION. Here is the previous draft the teacher reviewed (JSON):\n${JSON.stringify(
        opts.previous,
        null,
        2
      ).slice(0, 6000)}`
    );
  }
  if (opts.feedback && opts.feedback.trim()) {
    parts.push(
      `\nThe teacher asked for these specific changes — follow them carefully and improve the draft accordingly:\n"${opts.feedback.trim()}"`
    );
  } else if (opts.previous) {
    parts.push(
      `\nThe teacher was not satisfied with the previous draft but gave no specific notes. Produce a genuinely different, stronger version — vary the topics, difficulty mix, and lesson framing.`
    );
  }

  parts.push(`
Create a complete personalized package and return STRICT JSON with this exact shape:
{
  "weak_areas": ["3-6 specific SAT topics to focus on, e.g. 'Linear equations', 'Command of evidence'"],
  "target_score": 1400,
  "notes": "2-4 sentence private note for the teacher: this student's situation, goals, and what to watch for",
  "ai_summary": "1-2 friendly sentences the student will see, welcoming them and naming their focus areas",
  "study_plan": "a personalized markdown study plan (## headings, bullet lists) paced to the student's timeline and weekly hours, focused on their weak areas",
  "lessons": [
    {
      "title": "clear lesson title",
      "section": "Reading and Writing" | "Math",
      "topic": "the specific SAT topic this lesson teaches",
      "difficulty": "Easy" | "Medium" | "Hard",
      "content": "the full teaching content in markdown — explain the concept clearly with examples and strategies, several paragraphs",
      "questions": [
        { "prompt": "practice question text", "choices": ["A ...","B ...","C ...","D ..."], "answer": "the exact correct choice text", "explanation": "why it's correct" }
      ],
      "study_plan": "1-2 sentences on how this lesson fits the student's plan"
    }
  ]
}

Generate exactly ${opts.lessonCount} lessons, each with 3-4 practice questions, targeting this student's weakest areas first. Make every lesson genuinely tailored to THIS student.`);

  return parts.join("\n");
}

export async function generateDraftPackage(
  student: Student,
  answers: Record<string, any>,
  opts: { feedback?: string; previous?: any; lessonCount?: number } = {}
): Promise<DraftPackage> {
  const lessonCount = opts.lessonCount ?? 4;
  const user = buildUserPrompt(student, answers, { ...opts, lessonCount });
  const raw = await aiComplete(SYSTEM, user, { json: true, temperature: 0.6 });
  const pkg = parseJsonFromModel(raw);

  // Defensive normalization so a malformed field never breaks the workflow.
  return {
    study_plan: typeof pkg.study_plan === "string" ? pkg.study_plan : "",
    ai_summary: typeof pkg.ai_summary === "string" ? pkg.ai_summary : "",
    notes: typeof pkg.notes === "string" ? pkg.notes : "",
    weak_areas: Array.isArray(pkg.weak_areas) ? pkg.weak_areas : [],
    target_score:
      typeof pkg.target_score === "number" ? pkg.target_score : 1400,
    lessons: Array.isArray(pkg.lessons)
      ? pkg.lessons.map((l: any) => ({
          title: String(l.title || "Lesson"),
          section: String(l.section || "Math"),
          topic: String(l.topic || ""),
          difficulty: String(l.difficulty || "Medium"),
          content: String(l.content || ""),
          questions: Array.isArray(l.questions)
            ? l.questions.map((q: any) => ({
                prompt: String(q.prompt || ""),
                choices: Array.isArray(q.choices) ? q.choices.map(String) : [],
                answer: String(q.answer || ""),
                explanation: String(q.explanation || ""),
              }))
            : [],
          study_plan: String(l.study_plan || ""),
        }))
      : [],
  };
}

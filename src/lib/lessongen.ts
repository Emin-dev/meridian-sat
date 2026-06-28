import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import type { Student } from "@/lib/supabase";
import { MATH_AUTHORING } from "@/lib/mathprompt";
import {
  selectCuratedSources,
  renderSourcePack,
  type CuratedChunk,
} from "@/lib/satcontent";

// ---------------------------------------------------------------------------
// Draft package generation
// ---------------------------------------------------------------------------
// Builds the full personalized package a teacher reviews before it reaches the
// student: study plan + an initial set of lessons + a private tutor note +
// a short welcome summary. Used by onboarding and by the regenerate flow.
//
// ARCHITECTURE (per the model council — Claude Opus 4.8 / GPT 5.5 / Gemini 3.1
// Pro all converged on this): lessons are GROUNDED in a curated SAT content
// base (the "80%") that is injected as APPROVED SOURCE MATERIAL, and the model
// only generates personalized connective tissue, framing, and adaptation (the
// "20%"). This is RAG-style grounding — it raises factual correctness and cuts
// the risk of teaching wrong SAT rules in a high-stakes test-prep product.
// A personalization guard then verifies the lesson truly reflects THIS
// student's profile and regenerates once if it reads generic.
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
You follow the official Digital SAT structure: two sections — "Reading and Writing" and "Math" — each scored 200-800 for a 400-1600 total, mapped to the official College Board content domains.
You write warm, clear, encouraging material at the right level for each student.

GROUNDING CONTRACT (critical):
- You are given APPROVED SOURCE MATERIAL: vetted SAT concepts, worked examples, and common misconceptions.
- Ground every lesson in this source material. ~80% of the instructional substance (the concepts, the rules, the worked-example math) MUST come from the approved sources — do NOT invent new SAT rules or contradict the sources.
- The ~20% you generate is the PERSONALIZATION: the framing, the "why this matters for YOU", re-leveling to the student's grade/confidence, transitions, and the practice questions tied to the student's specific weak areas.
- Never state a math fact, rule, or answer key that conflicts with the approved sources. If a needed concept is not in the sources, teach it conservatively and correctly using standard SAT methods.

You ALWAYS return valid JSON only, with no commentary or code fences.`;

// Pull the survey answers into a compact, human-readable student profile so the
// model conditions on real signals (per-field, per the council's mapping) rather
// than scanning a raw JSON blob.
function buildProfile(student: Student, answers: Record<string, any>): {
  text: string;
  weakAreas: string[];
  targetScore: number;
} {
  const a = answers || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = a[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
  };

  const grade = student.grade || pick("grade", "year") || "unknown";
  const targetScore =
    Number(student.target_score) ||
    Number(pick("target_score", "target", "goal_score")) ||
    1400;
  const timeline =
    pick("timeline", "test_date", "exam_date", "weeks_until_test", "when") ||
    "unspecified";
  const hours =
    pick("study_hours", "hours_per_week", "weekly_hours", "hours") ||
    "unspecified";
  const confidence =
    pick("confidence", "confidence_level", "self_rating") || "unspecified";
  const currentScore = pick("current_score", "baseline_score", "last_score");
  const strengths = pick("strengths", "strong_areas", "good_at");
  const motivation = pick("motivation", "why", "goal");

  const weakFromStudent = Array.isArray(student.weak_areas)
    ? student.weak_areas.filter(Boolean)
    : [];
  const weakFromSurvey = (() => {
    const w = pick("weak_areas", "weaknesses", "struggle_with", "focus_areas");
    if (Array.isArray(w)) return w.filter(Boolean).map(String);
    if (typeof w === "string" && w.trim()) return [w.trim()];
    return [];
  })();
  const weakAreas = Array.from(
    new Set([...weakFromStudent, ...weakFromSurvey])
  );

  const lines: string[] = [];
  lines.push(`- Name: ${student.name}`);
  lines.push(`- Grade: ${grade}`);
  lines.push(`- Target score: ${targetScore} / 1600`);
  if (currentScore) lines.push(`- Current/baseline score: ${currentScore}`);
  lines.push(
    `- Weak areas to prioritize: ${weakAreas.length ? weakAreas.join(", ") : "to be inferred from the survey"}`
  );
  if (strengths) lines.push(`- Strengths: ${JSON.stringify(strengths)}`);
  lines.push(`- Timeline until test: ${timeline}`);
  lines.push(`- Weekly study hours available: ${hours}`);
  lines.push(`- Confidence level: ${confidence}`);
  if (motivation) lines.push(`- Motivation/goal: ${JSON.stringify(motivation)}`);

  return { text: lines.join("\n"), weakAreas, targetScore };
}

function buildUserPrompt(
  student: Student,
  answers: Record<string, any>,
  opts: {
    feedback?: string;
    previous?: any;
    lessonCount: number;
    profileText: string;
    sourcePack: string;
  }
): string {
  const parts: string[] = [];

  parts.push(`STUDENT PROFILE — tailor EVERY part of this package to this exact student:\n${opts.profileText}`);

  parts.push(
    `\nHow each profile field must shape the package:\n- Grade -> vocabulary level, assumed prior knowledge, complexity of examples.\n- Target score -> the difficulty ceiling of practice items and the ambition of the plan.\n- Weak areas -> which topics to teach FIRST and most deeply.\n- Timeline -> how dense the plan is and the review-vs-new-material balance (a short timeline is NOT a long plan slowed down).\n- Weekly hours -> session length and total scope (never plan more than the student can complete).\n- Confidence -> tone and scaffolding depth (low confidence needs early wins and encouragement; high confidence can be stretched).\n- Address the student by name occasionally and naturally, not in every sentence.`
  );

  if (opts.sourcePack) {
    parts.push(
      `\nAPPROVED SOURCE MATERIAL — ground the lessons in these vetted SAT concepts and worked examples. Reuse and adapt this substance (the ~80%); do not contradict it:\n${opts.sourcePack}`
    );
  }

  parts.push(`\nFull onboarding survey answers (JSON, for any extra context):\n${JSON.stringify(answers, null, 2)}`);

  if (opts.previous) {
    parts.push(
      `\nThis is a REVISION. Here is the previous draft the teacher reviewed (JSON):\n${JSON.stringify(
        opts.previous,
        null,
        2
      ).slice(0, 5000)}`
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

  parts.push(`\n${MATH_AUTHORING}`);

  parts.push(`
Create a complete personalized package and return STRICT JSON with this exact shape:
{
  "weak_areas": ["3-6 specific SAT topics to focus on, drawn from the student's profile and the official content domains, e.g. 'Systems of linear equations', 'Command of evidence'"],
  "target_score": ${opts.profileText.includes("Target score") ? "the student's target score as a number" : 1400},
  "notes": "2-4 sentence private note for the teacher: this student's situation, goals, and what to watch for",
  "ai_summary": "1-2 friendly sentences the student will see, welcoming them BY NAME and naming their specific focus areas",
  "study_plan": "a personalized markdown study plan (## headings, bullet lists) paced to THIS student's exact timeline and weekly hours, ordered by their weak areas first. Open with one sentence explaining why this plan fits them.",
  "lessons": [
    {
      "title": "clear lesson title",
      "section": "Reading and Writing" | "Math",
      "topic": "the specific SAT topic this lesson teaches",
      "difficulty": "Easy" | "Medium" | "Hard",
      "content": "the full teaching content in Markdown, grounded in the approved sources. Open with a short personalized 'Why this lesson is for you' line referencing the student's situation. Use REAL typeset math (see math rules): inline \\( ... \\) and display \\[ ... \\]. Add a graph or figure with a fenced plot/figure block whenever it aids understanding. Several paragraphs with worked examples and a misconception callout.",
      "questions": [
        { "prompt": "practice question text with math typeset as \\( ... \\) / \\[ ... \\] and a plot/figure block if it references a graph, table, or shape", "choices": ["A) ...","B) ...","C) ...","D) ..."], "answer": "the correct choice LETTER only, e.g. \"B\"", "explanation": "why it's correct, showing the worked steps in typeset math" }
      ],
      "study_plan": "1-2 sentences on how this lesson fits the student's plan"
    }
  ]
}

Generate exactly ${opts.lessonCount} lessons, each with 3-4 practice questions, targeting this student's weakest areas first and matching the difficulty to their target score. Make every lesson unmistakably tailored to THIS student — a different student with different weak areas, timeline, and confidence must receive a visibly different package.`);

  return parts.join("\n");
}

// Minimal, always-valid starter package used when AI generation is unavailable.
// Guarantees the teacher always has a draft to approve so a first-login student
// is never stuck in the "preparing" state with an empty review queue. Even the
// fallback grounds its lessons in the curated content base and injects the
// student's REAL weak areas so it never feels generic.
export function fallbackPackage(student: any): DraftPackage {
  const name = student?.name || "there";
  const weak =
    Array.isArray(student?.weak_areas) && student.weak_areas.length
      ? student.weak_areas
      : ["Words in context", "Linear equations", "Data analysis"];
  const target = student?.target_score || 1400;

  // Ground the fallback lessons in real curated chunks matched to weak areas.
  const sources = selectCuratedSources(weak, { limit: 4 });
  const lessons = sources.slice(0, 3).map((c: CuratedChunk) => ({
    title: c.skill,
    section: c.section,
    topic: c.skill,
    difficulty:
      c.difficulty === "Foundations"
        ? "Easy"
        : c.difficulty === "Advanced"
          ? "Hard"
          : "Medium",
    content: `## ${c.skill}\n\n${c.concept}\n\n**Worked example.** ${c.worked_example}\n\n**Watch out for:** ${c.common_misconceptions.join(" ")}`,
    questions: [],
    study_plan: `Part of your focus on ${c.domain}.`,
  }));

  return {
    study_plan: `## Welcome, ${name}!\n\nHere is a starting study plan focused on your priority areas. Your teacher can refine this before it reaches you.\n\n### Your focus areas\n${weak.map((w: string) => `- ${w}`).join("\n")}\n\n### Suggested weekly rhythm\n- 2 short Reading & Writing sessions\n- 2 short Math sessions\n- 1 mixed review`,
    ai_summary: `Welcome ${name}! Here's a starter plan focused on ${weak.slice(0, 2).join(" and ")}. Your teacher will tailor it to you.`,
    notes:
      "Auto-generated starter package (AI personalization was unavailable). Lessons are grounded in the curated content base and seeded with the student's real weak areas. Review and refine, then approve to unlock the student.",
    weak_areas: weak,
    target_score: target,
    lessons: lessons.length
      ? lessons
      : [
          {
            title: "Words in Context",
            section: "Reading and Writing",
            topic: "Vocabulary in context",
            difficulty: "Medium",
            content:
              "## Words in Context\n\nThe SAT often asks you to pick the word that best fits a sentence's meaning. Read the whole sentence, predict the meaning of the blank in your own words, then match it to the closest choice.",
            questions: [],
            study_plan: "Start here to build core reading skills.",
          },
        ],
  };
}

// Heuristic personalization guard: does the produced package actually reflect
// THIS student? Checks that the student's name and at least some weak areas /
// profile signals show up in the visible copy. Cheap, deterministic, and used
// to trigger a single regeneration before falling back.
function isPersonalized(
  pkg: DraftPackage,
  student: Student,
  weakAreas: string[]
): boolean {
  const blob = [
    pkg.ai_summary,
    pkg.study_plan,
    pkg.notes,
    ...pkg.lessons.map((l) => `${l.title} ${l.topic} ${l.content}`),
  ]
    .join(" ")
    .toLowerCase();

  if (!blob.trim()) return false;

  const name = (student.name || "").toLowerCase();
  const nameHit = name.length > 1 && blob.includes(name);

  let weakHits = 0;
  for (const w of weakAreas) {
    const tokens = String(w)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 3);
    if (tokens.some((t) => blob.includes(t))) weakHits++;
  }

  // Personalized if the welcome greets by name AND at least one weak area is
  // reflected, OR the package strongly reflects multiple weak areas.
  return (nameHit && weakHits >= 1) || weakHits >= 2;
}

function normalize(pkg: any): DraftPackage {
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

export async function generateDraftPackage(
  student: Student,
  answers: Record<string, any>,
  opts: { feedback?: string; previous?: any; lessonCount?: number } = {}
): Promise<DraftPackage> {
  const lessonCount = opts.lessonCount ?? 4;

  // Build the student profile + select grounded curated sources biased to the
  // student's weak areas (retrieval-side personalization).
  const profile = buildProfile(student, answers);
  const sources = selectCuratedSources(profile.weakAreas, { limit: 6 });
  const sourcePack = renderSourcePack(sources);

  const run = async (): Promise<DraftPackage> => {
    const user = buildUserPrompt(student, answers, {
      ...opts,
      lessonCount,
      profileText: profile.text,
      sourcePack,
    });
    // Generous token budget: deepseek-v4-pro is a reasoning model and spends
    // hidden reasoning tokens BEFORE the visible answer. A 4-lesson package is
    // large, so reserve big headroom or the answer truncates to empty
    // (finish_reason "length"). All three council models flagged this trap.
    const raw = await aiComplete(SYSTEM, user, {
      json: true,
      temperature: 0.6,
      maxTokens: 16000,
    });
    return normalize(parseJsonFromModel(raw));
  };

  let pkg: DraftPackage;
  try {
    pkg = await run();
    // If the model returned an empty/degenerate package, retry once.
    if (!pkg.lessons.length || !pkg.study_plan.trim()) {
      pkg = await run();
    }
    // Personalization guard: regenerate once if it reads generic.
    if (!isPersonalized(pkg, student, profile.weakAreas)) {
      const retry = await run();
      // Keep whichever version is actually personalized; prefer the retry if
      // both fail (it tends to be richer), but never ship an empty package.
      if (isPersonalized(retry, student, profile.weakAreas) || !pkg.lessons.length) {
        pkg = retry;
      }
    }
  } catch {
    // Hard failure (API down, unparseable) -> grounded fallback so the teacher
    // always has a real draft to review.
    return fallbackPackage({
      ...student,
      weak_areas: profile.weakAreas.length
        ? profile.weakAreas
        : student.weak_areas,
      target_score: profile.targetScore,
    });
  }

  // Final safety net: if still empty after retries, use the grounded fallback.
  if (!pkg.lessons.length || !pkg.study_plan.trim()) {
    return fallbackPackage({
      ...student,
      weak_areas: profile.weakAreas.length
        ? profile.weakAreas
        : student.weak_areas,
      target_score: profile.targetScore,
    });
  }

  // Ensure weak_areas/target are populated from the profile if the model omitted.
  if (!pkg.weak_areas.length && profile.weakAreas.length)
    pkg.weak_areas = profile.weakAreas;
  if (!pkg.target_score) pkg.target_score = profile.targetScore;

  return pkg;
}

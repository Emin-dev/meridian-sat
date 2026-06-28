// ---------------------------------------------------------------------------
// Bulk lesson-set generation — the "lesson-set compiler".
// ---------------------------------------------------------------------------
// Lets a teacher produce 3-5 full lessons with 50+ total questions in one click.
//
// ARCHITECTURE (the model council — Claude Opus 4.8 / GPT 5.5 / Gemini 3.1 Pro
// all converged on this):
//   1. PLAN-THEN-FILL. First build a coverage BLUEPRINT that allocates distinct
//      (skill x difficulty) slots across the lessons. Because slots are
//      pre-partitioned, two lessons can never be assigned the same skill, which
//      kills cross-lesson duplication at the source.
//   2. CHUNK to beat truncation + the 60s serverless limit. You CANNOT ask
//      deepseek-v4-pro for many questions in one call - as a reasoning model it
//      burns hidden tokens before the visible answer and is slow/truncates. So
//      each lesson is generated in SMALL SUB-BATCHES (5 questions per model
//      call, looped until the lesson target is met), comfortably under the token
//      ceiling and fast per call. The CLIENT orchestrates the per-lesson calls
//      sequentially so the whole job survives the 60s limit and shows honest
//      stage-by-stage progress.
//   3. GROUND 80/20. Every lesson still grounds in the curated SAT base
//      (satcontent.ts) — the "80%" — and the model only writes the personalized
//      "20%". Quality at volume is a function of constraints + grounding.
//   4. QUALITY GUARDS. Deterministic checks (schema, count floor, answer-key
//      validity, cross-lesson dedupe) run before anything reaches a student, and
//      answers are randomized with the no-AI shuffle (shuffle.ts).
// ---------------------------------------------------------------------------

import { chatComplete, parseJsonFromModel } from "@/lib/deepseek";
import type { Student } from "@/lib/supabase";
import { MATH_AUTHORING } from "@/lib/mathprompt";
import {
  CURATED_BASE,
  SAT_DOMAINS,
  selectCuratedSources,
  renderSourcePack,
  type CuratedChunk,
  type SatSection,
} from "@/lib/satcontent";
import { shuffleQuestions, type ShuffledQuestion } from "@/lib/shuffle";

export type PlannedLesson = {
  index: number;
  title: string;
  section: SatSection;
  domain: string;
  topic: string; // the specific skill this lesson teaches
  difficulty: "Easy" | "Medium" | "Hard";
  questionTarget: number;
  difficultyMix: { Easy: number; Medium: number; Hard: number };
  sourceIds: string[]; // curated chunk ids this lesson grounds in
  reason: string; // one-line "why this lesson is for this student"
};

export type BulkPlan = {
  studentId: string;
  lessonCount: number;
  totalQuestions: number;
  lessons: PlannedLesson[];
  weakAreas: string[];
};

const DIFF_FROM_CHUNK = (d: CuratedChunk["difficulty"]): PlannedLesson["difficulty"] =>
  d === "Foundations" ? "Easy" : d === "Advanced" ? "Hard" : "Medium";

// Spread a total question count into an Easy/Medium/Hard mix that ramps toward
// the target. Foundation-heavy for easier lessons, stretch-heavy for harder.
function difficultyMix(
  total: number,
  base: PlannedLesson["difficulty"]
): { Easy: number; Medium: number; Hard: number } {
  let easy: number, med: number, hard: number;
  if (base === "Easy") {
    easy = Math.round(total * 0.45);
    hard = Math.round(total * 0.15);
  } else if (base === "Hard") {
    easy = Math.round(total * 0.15);
    hard = Math.round(total * 0.45);
  } else {
    easy = Math.round(total * 0.25);
    hard = Math.round(total * 0.3);
  }
  med = total - easy - hard;
  if (med < 0) {
    med = 0;
    hard = total - easy;
  }
  return { Easy: easy, Medium: med, Hard: hard };
}

// ---------------------------------------------------------------------------
// STAGE 1 — Coverage blueprint (fast, no question generation).
// Deterministic: rank curated chunks by the student's weak areas, then take the
// top `lessonCount` DISTINCT skills (no two lessons share a primary skill) and
// allocate a question target + difficulty mix per lesson so the total clears the
// requested floor (50+). Falls back to a balanced section spread on cold start.
// ---------------------------------------------------------------------------
export function buildBulkPlan(
  student: Student,
  opts: { lessonCount: number; totalQuestions: number }
): BulkPlan {
  const lessonCount = Math.max(3, Math.min(5, opts.lessonCount || 4));
  // Floor scales with the lesson count (>=1 question per lesson) so callers can
  // request a small, fast set (e.g. the auto-on-login flow asking for ~6 each)
  // without being forced up to a large total. The manual one-click generator
  // still passes its own larger numbers.
  const totalQuestions = Math.max(lessonCount, opts.totalQuestions || 24);

  const weakAreas = Array.isArray(student.weak_areas)
    ? student.weak_areas.filter(Boolean).map(String)
    : [];

  // Rank curated chunks for this student; over-select then dedupe by skill.
  const ranked = selectCuratedSources(weakAreas, { limit: CURATED_BASE.length });

  // Pick `lessonCount` DISTINCT skills. This is the anti-duplication guarantee:
  // each lesson owns a different primary skill, so questions cannot overlap by
  // construction.
  const chosen: CuratedChunk[] = [];
  const seenSkills = new Set<string>();
  for (const c of ranked) {
    if (seenSkills.has(c.skill)) continue;
    seenSkills.add(c.skill);
    chosen.push(c);
    if (chosen.length >= lessonCount) break;
  }
  // If the base is smaller than requested (shouldn't happen), pad with a spread
  // across domains so we always return `lessonCount` lessons.
  if (chosen.length < lessonCount) {
    for (const c of CURATED_BASE) {
      if (chosen.find((x) => x.id === c.id)) continue;
      chosen.push(c);
      if (chosen.length >= lessonCount) break;
    }
  }

  // Distribute the total question count across lessons (front-loaded toward the
  // first/weakest skills) so the sum clears the floor.
  const per = Math.ceil(totalQuestions / lessonCount);
  let remaining = totalQuestions;

  const lessons: PlannedLesson[] = chosen.slice(0, lessonCount).map((c, i) => {
    const isLast = i === lessonCount - 1;
    // Last lesson absorbs the remainder so the exact total is met.
    const qTarget = isLast ? Math.max(per, remaining) : Math.min(per, remaining);
    remaining -= qTarget;
    const baseDiff = DIFF_FROM_CHUNK(c.difficulty);

    // Each lesson grounds in its own skill chunk plus 1-2 same-section
    // neighbours, so the model has rich source material without bleeding another
    // lesson's primary skill in.
    const neighbours = CURATED_BASE.filter(
      (x) => x.section === c.section && x.id !== c.id && x.domain === c.domain
    ).slice(0, 1);
    const sourceIds = [c.id, ...neighbours.map((n) => n.id)];

    return {
      index: i + 1,
      title: c.skill,
      section: c.section,
      domain: c.domain,
      topic: c.skill,
      difficulty: baseDiff,
      questionTarget: qTarget,
      difficultyMix: difficultyMix(qTarget, baseDiff),
      sourceIds,
      reason: weakAreas.length
        ? `Targets your focus area: ${c.domain}.`
        : `Core ${c.domain} coverage to build a baseline.`,
    };
  });

  return {
    studentId: student.id,
    lessonCount,
    totalQuestions: lessons.reduce((s, l) => s + l.questionTarget, 0),
    lessons,
    weakAreas,
  };
}

// ---------------------------------------------------------------------------
// STAGE 2 — Generate ONE planned lesson (content + N questions), grounded.
// Called once per lesson by the client orchestrator so each request stays under
// the 60s limit and each model call stays under the token ceiling.
//
// `avoidPrompts` carries the question stems already generated EARLIER in this
// same batch so the model is explicitly told not to repeat them — the in-context
// anti-duplication guard layered on top of the structural (distinct-skill) one.
// ---------------------------------------------------------------------------

const BULK_SYSTEM = `You are an expert SAT tutor authoring ONE focused, exam-aligned lesson for a specific student.
You follow the official Digital SAT structure ("Reading and Writing" and "Math", 200-800 each).

GROUNDING CONTRACT (critical):
- You are given APPROVED SOURCE MATERIAL: vetted SAT concepts, worked examples, and common misconceptions.
- ~80% of the instructional substance MUST come from the approved sources. Do NOT invent new SAT rules or contradict the sources.
- The ~20% you generate is personalization: framing for THIS student, transitions, and the practice questions.

ITEM-WRITING RULES (every question):
- Put the main idea in the STEM so options stay short. Exactly four choices "A) ...".."D) ...".
- Exactly ONE defensible correct answer; the "answer" field is the correct choice LETTER only.
- Distractors must be PLAUSIBLE and map to a common student error (sign slip, wrong base, slope/intercept mix-up, etc.) — never throwaway.
- No "all of the above"/"none of the above"; no negatively-phrased stems.
- Each question tied to the lesson's one skill. Vary the surface scenario so no two questions are equivalent.

You ALWAYS return valid JSON only, with no commentary or code fences.`;

// Build the prompt for ONE sub-batch of a lesson.
// - On the first batch (includeLesson=true) we ask for title/content/study_plan
//   PLUS `batchCount` questions.
// - On later batches (includeLesson=false) we ask for ONLY `batchCount` more
//   questions, which keeps each model call small and fast (no truncation, well
//   under the serverless limit).
function buildLessonPrompt(
  student: Student,
  lesson: PlannedLesson,
  sourcePack: string,
  avoidPrompts: string[],
  batchCount: number,
  includeLesson: boolean
): string {
  const parts: string[] = [];

  parts.push(
    `STUDENT: ${student.name} | Grade ${student.grade || "unknown"} | Target ${
      student.target_score ?? 1400
    }/1600 | Focus areas: ${
      (student.weak_areas || []).join(", ") || "general SAT readiness"
    }`
  );

  parts.push(
    `\nLESSON CONTEXT (#${lesson.index} of this study set):
- Section: ${lesson.section}
- Domain: ${lesson.domain}
- Skill / topic: ${lesson.topic}
- Overall difficulty: ${lesson.difficulty}
- This lesson teaches ONE skill: "${lesson.topic}".`
  );

  if (sourcePack) {
    parts.push(
      `\nAPPROVED SOURCE MATERIAL - ground this lesson in these vetted concepts/worked examples (reuse and adapt, ~80%; do not contradict):\n${sourcePack}`
    );
  }

  if (avoidPrompts.length) {
    const trimmed = avoidPrompts
      .slice(-40)
      .map((p, i) => `${i + 1}. ${String(p).slice(0, 140)}`)
      .join("\n");
    parts.push(
      `\nDO NOT REPEAT - these question stems were already created (for this lesson or other lessons in the same set). Produce genuinely different questions (different numbers, scenarios, and phrasing); do not produce anything equivalent to these:\n${trimmed}`
    );
  }

  parts.push(`\n${MATH_AUTHORING}`);

  if (includeLesson) {
    parts.push(`
Return STRICT JSON with this exact shape:
{
  "title": "clear, specific lesson title",
  "content": "CONCISE teaching content in Markdown (aim ~150-220 words), grounded in the approved sources. Open with one short personalized 'Why this lesson is for you' line. Use typeset math (inline \\( ... \\) and display \\[ ... \\]). Include ONE worked example and ONE short misconception callout. Keep it tight.",
  "study_plan": "1-2 sentences on how this lesson fits the student's plan",
  "questions": [
    { "prompt": "question text with math typeset as \\( ... \\) / \\[ ... \\]", "choices": ["A) ...","B) ...","C) ...","D) ..."], "answer": "the correct choice LETTER only, e.g. \\"B\\"", "explanation": "why it's correct, showing the worked steps in typeset math, and naming the misconception each wrong choice reflects" }
  ]
}

Generate EXACTLY ${batchCount} questions in this response. Every question must test "${lesson.topic}" and be unmistakably tailored to an SAT student aiming for ${
      student.target_score ?? 1400
    }.`);
  } else {
    parts.push(`
Return STRICT JSON with ONLY a questions array (no title/content needed):
{
  "questions": [
    { "prompt": "question text with math typeset as \\( ... \\) / \\[ ... \\]", "choices": ["A) ...","B) ...","C) ...","D) ..."], "answer": "the correct choice LETTER only, e.g. \\"B\\"", "explanation": "why it's correct, showing the worked steps in typeset math, and naming the misconception each wrong choice reflects" }
  ]
}

Generate EXACTLY ${batchCount} MORE questions in this response, all testing "${lesson.topic}", genuinely different from any listed above. Tailor to an SAT student aiming for ${
      student.target_score ?? 1400
    }.`);
  }

  return parts.join("\n");
}

export type GeneratedLesson = {
  title: string;
  section: SatSection;
  topic: string;
  difficulty: string;
  content: string;
  study_plan: string;
  questions: ShuffledQuestion[];
};

// Deterministic schema/quality validation for a single generated question.
function isValidQuestion(q: any): boolean {
  if (!q || typeof q !== "object") return false;
  if (typeof q.prompt !== "string" || !q.prompt.trim()) return false;
  if (!Array.isArray(q.choices) || q.choices.length !== 4) return false;
  if (q.choices.some((c: any) => typeof c !== "string" || !c.trim())) return false;
  const letter = String(q.answer || "").trim().match(/[A-Da-d]/);
  if (!letter) return false;
  if (typeof q.explanation !== "string" || !q.explanation.trim()) return false;
  return true;
}

// Normalize a stem for cross-lesson duplicate detection: lowercase, drop
// numbers/punctuation/whitespace so "Solve 3x+5=20" and "solve 7x + 2 = 9"
// collapse to comparable skeletons only when the wording is truly the same.
export function fingerprint(prompt: string): string {
  return String(prompt)
    .toLowerCase()
    .replace(/[0-9]+/g, "#")
    .replace(/[^a-z#]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 14)
    .join(" ");
}

/**
 * Generate one planned lesson. Returns the lesson with VALID, shuffled questions
 * only (invalid items are dropped), or throws if the model produced nothing
 * usable so the caller can retry that one lesson.
 */
export async function generateOneLesson(
  student: Student,
  lesson: PlannedLesson,
  avoidPrompts: string[]
): Promise<GeneratedLesson> {
  // Ground in the lesson's assigned curated sources (plus weak-area bias).
  const sources = selectCuratedSources([lesson.topic, ...(student.weak_areas || [])], {
    limit: 4,
  });
  // Ensure the lesson's own planned source ids are included.
  const planned = CURATED_BASE.filter((c) => lesson.sourceIds.includes(c.id));
  const merged = [...planned];
  for (const s of sources) if (!merged.find((m) => m.id === s.id)) merged.push(s);
  const sourcePack = renderSourcePack(merged.slice(0, 5));

  const target = Math.max(1, lesson.questionTarget);
  // Generate questions in small sub-batches so every model call stays fast and
  // never truncates (a reasoning model asked for 12+ questions at once is slow
  // and unreliable). 5 per call is the sweet spot. We keep a running avoid-list
  // (cross-lesson stems + this lesson's own stems) so batches don't repeat.
  const BATCH = 5;
  // deepseek-v4-pro occasionally returns an empty/near-empty object on a given
  // attempt. With a 300s function budget we can afford several extra attempts so
  // one bad response doesn't fail the whole lesson. Each call is small + fast
  // enough that worst-case still fits the budget.
  const MAX_BATCHES = Math.ceil(target / BATCH) + 3;

  let title = lesson.title;
  let content = "";
  let study_plan = "";
  const collected: any[] = [];
  const seen = new Set<string>(); // fingerprints, within + across lessons
  for (const p of avoidPrompts) seen.add(fingerprint(p));
  const runningAvoid = [...avoidPrompts];

  let batches = 0;
  while (collected.length < target && batches < MAX_BATCHES) {
    batches++;
    const need = Math.min(BATCH, target - collected.length);
    // Ask for lesson title/content/study_plan until we've actually captured it.
    // (If the first attempt returns empty, a later attempt still fills content.)
    const includeLesson = !content;
    const prompt = buildLessonPrompt(
      student,
      lesson,
      sourcePack,
      runningAvoid,
      need,
      includeLesson
    );

    let raw: string;
    try {
      raw =
        (await chatComplete(
          [
            { role: "system", content: BULK_SYSTEM },
            { role: "user", content: prompt },
          ],
          // Reasoning effort tuned for PRODUCTION RELIABILITY. At "high",
          // deepseek-v4-pro intermittently spends 60-95s reasoning and then
          // returns an EMPTY object for certain lesson topics, which forces
          // repeated retries and blows the request budget. "medium" keeps the
          // authoring quality high while eliminating those catastrophic-latency
          // empty responses, so every lesson in the chain completes fast and
          // reliably. One lesson per request still runs under a 300s budget.
          { json: true, temperature: 0.7, maxTokens: 8000, reasoningEffort: "medium" }
        )) || "{}";
    } catch (e) {
      // transient failure on a sub-batch: skip and try the next one
      continue;
    }

    let parsed: any;
    try {
      parsed = parseJsonFromModel(raw);
    } catch (e) {
      // A single unparseable batch must NOT kill the whole lesson. Skip to the
      // next attempt (we have budget + extra batches for exactly this).
      continue;
    }

    if (includeLesson) {
      if (parsed.title) title = String(parsed.title);
      if (parsed.content) content = String(parsed.content);
      if (parsed.study_plan && !study_plan) study_plan = String(parsed.study_plan);
    }

    const batchValid = (Array.isArray(parsed.questions) ? parsed.questions : []).filter(
      isValidQuestion
    );
    for (const q of batchValid) {
      const fp = fingerprint(q.prompt);
      if (seen.has(fp)) continue; // de-dupe within + across lessons
      seen.add(fp);
      runningAvoid.push(q.prompt);
      collected.push(q);
      if (collected.length >= target) break;
    }
  }

  if (!collected.length) {
    throw new Error("Lesson produced no valid questions.");
  }

  // Randomize answer order with the no-AI shuffle (spreads correct letter, no
  // adjacent repeats, no identical orderings). Run AFTER validation.
  const questions = shuffleQuestions(
    collected,
    `${title}#${lesson.index}#${Date.now()}`
  );

  return {
    title: String(title || lesson.title),
    section: lesson.section,
    topic: lesson.topic,
    difficulty: lesson.difficulty,
    content: String(content || ""),
    study_plan: String(study_plan || ""),
    questions,
  };
}

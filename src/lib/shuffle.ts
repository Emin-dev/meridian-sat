// ---------------------------------------------------------------------------
// Deterministic, AI-free answer-choice randomization.
// ---------------------------------------------------------------------------
// Problem this solves: the language model has a strong positional bias — it
// tends to place the correct answer at the same letter (very often "C") over and
// over. That makes practice gameable and unrealistic. The model cannot be
// trusted to randomize its own answer key.
//
// So we strip the letter prefixes, shuffle the choice CONTENT with a real
// pseudo-random generator (no AI involved), re-letter the choices A) B) C) D)
// in their new order, and re-point the `answer` field at wherever the correct
// content landed. We then run a spread pass across a lesson's questions so the
// correct letter is distributed (no long runs of the same letter) and adjacent
// questions never share the identical option ordering.
//
// Everything here is pure + deterministic given a seed, so it is fully testable
// without any network or model call.
// ---------------------------------------------------------------------------

export type RawQuestion = {
  prompt?: string;
  choices?: string[];
  answer?: string;
  explanation?: string;
  [k: string]: unknown;
};

export type ShuffledQuestion = {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

// --- seeded RNG (mulberry32) -------------------------------------------------
// A real, uniform PRNG so positions are genuinely random — not the model's
// guess. Seeded so a given lesson reshuffles identically across renders.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable string hash → 32-bit int, so a seed string yields a fixed sequence.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Fisher–Yates using the provided rng. Returns the shuffled array AND the
// permutation (old index for each new slot) so callers can track the key.
function shuffleWithPerm<T>(arr: T[], rng: () => number): { out: T[]; perm: number[] } {
  const idx = arr.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return { out: idx.map((i) => arr[i]), perm: idx };
}

// Strip a leading "A) ", "B.", "C)" style label if present, returning the bare
// choice text. We re-label after shuffling so the letters always match order.
function stripLabel(choice: string): string {
  return String(choice)
    .replace(/^\s*[A-Fa-f]\s*[\).:\-]\s*/, "")
    .trim();
}

// Letter the student's answer field points at (e.g. "B" from "B" or "B) ...").
function answerLetter(answer: string): string {
  const m = String(answer).trim().match(/[A-Fa-f]/);
  return m ? m[0].toUpperCase() : "";
}

/**
 * Randomize ONE question's choice order with a real RNG and re-point its answer.
 *
 * - Returns choices re-labelled "A) ", "B) ", ... in their new random order.
 * - `answer` becomes the letter where the originally-correct choice landed.
 * - If the question is malformed (no choices, or the answer can't be located),
 *   it is returned untouched rather than corrupted.
 */
export function shuffleQuestion(q: RawQuestion, seed: string): ShuffledQuestion {
  const rawChoices = Array.isArray(q.choices) ? q.choices.map(String) : [];
  const base: ShuffledQuestion = {
    prompt: String(q.prompt || ""),
    choices: rawChoices,
    answer: String(q.answer || ""),
    explanation: String(q.explanation || ""),
  };

  if (rawChoices.length < 2) return base;

  // Which original index is the correct one?
  const corrLetter = answerLetter(base.answer);
  let correctIdx = corrLetter ? LETTERS.indexOf(corrLetter as (typeof LETTERS)[number]) : -1;

  // Fallback: maybe `answer` holds the full correct choice text, not a letter.
  if (correctIdx < 0 || correctIdx >= rawChoices.length) {
    const target = stripLabel(base.answer).toLowerCase();
    correctIdx = rawChoices.findIndex((c) => stripLabel(c).toLowerCase() === target);
  }
  if (correctIdx < 0 || correctIdx >= rawChoices.length) return base; // can't safely shuffle

  const bare = rawChoices.map(stripLabel);
  const rng = mulberry32(hashSeed(seed));
  const { out, perm } = shuffleWithPerm(bare, rng);

  // perm[newSlot] = oldIndex. Find where the correct old index now sits.
  const newCorrectSlot = perm.indexOf(correctIdx);

  return {
    prompt: base.prompt,
    choices: out.map((text, i) => `${LETTERS[i]}) ${text}`),
    answer: LETTERS[newCorrectSlot],
    explanation: base.explanation,
  };
}

/**
 * Randomize a whole lesson's question set.
 *
 * Beyond per-question shuffling, this enforces two realism guarantees WITHOUT
 * any AI:
 *   1. Spread — the correct letter is not allowed to repeat too often or run in
 *      long streaks (no "C every time"). If a question would extend a run, it is
 *      reshuffled with a bumped seed until the correct letter changes.
 *   2. Distinct ordering — two adjacent questions never share the exact same
 *      option ordering; a clash triggers a reshuffle with a bumped seed.
 *
 * `seedBase` should be stable for a lesson (e.g. lesson title + index) so the
 * same lesson renders consistently, but different lessons differ.
 */
export function shuffleQuestions(
  questions: RawQuestion[],
  seedBase: string
): ShuffledQuestion[] {
  if (!Array.isArray(questions)) return [];
  const result: ShuffledQuestion[] = [];
  let prevLetter = "";
  let runLetter = "";
  let runLen = 0;
  let prevOrderKey = "";

  questions.forEach((q, qi) => {
    let attempt = 0;
    let shuffled = shuffleQuestion(q, `${seedBase}#${qi}`);

    // Only re-roll questions that actually have ≥2 shufflable choices.
    const canReroll = Array.isArray(q.choices) && q.choices.length > 1;

    while (canReroll && attempt < 24) {
      const letter = shuffled.answer;
      const orderKey = shuffled.choices.map(stripLabel).join("||");

      const wouldExtendRun = letter === runLetter && runLen >= 1; // avoid back-to-back same letter
      const sameAsPrev = letter && letter === prevLetter; // avoid immediate repeat
      const sameOrder = orderKey === prevOrderKey; // avoid identical ordering

      if (!wouldExtendRun && !sameAsPrev && !sameOrder) break;

      attempt++;
      shuffled = shuffleQuestion(q, `${seedBase}#${qi}@${attempt}`);
    }

    const letter = shuffled.answer;
    const orderKey = shuffled.choices.map(stripLabel).join("||");
    if (letter === runLetter) runLen++;
    else {
      runLetter = letter;
      runLen = 1;
    }
    prevLetter = letter;
    prevOrderKey = orderKey;
    result.push(shuffled);
  });

  return result;
}

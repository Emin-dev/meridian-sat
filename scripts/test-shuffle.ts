// Automated, AI-free verification of answer randomization.
// Run: npx tsx scripts/test-shuffle.ts
import { shuffleQuestion, shuffleQuestions } from "../src/lib/shuffle";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

// A model that ALWAYS makes "C" correct, to simulate the real bias.
function biasedQuestion(i: number) {
  return {
    prompt: `Question ${i}: pick the right one.`,
    choices: [
      `A) wrong-${i}-a`,
      `B) wrong-${i}-b`,
      `C) right-${i}`, // correct content always at C
      `D) wrong-${i}-d`,
    ],
    answer: "C",
    explanation: `right-${i} is correct.`,
  };
}

console.log("== Test 1: per-question correctness is preserved ==");
{
  const q = biasedQuestion(1);
  const s = shuffleQuestion(q, "seed-xyz");
  const correctText = s.choices.find((c) => c.startsWith(`${s.answer})`)) || "";
  check(
    "answer letter points at the originally-correct content",
    correctText.includes("right-1"),
    `(answer=${s.answer}, choice="${correctText}")`
  );
  check("all four choices still present", s.choices.length === 4);
  check(
    "letters re-labelled A..D in order",
    s.choices.map((c) => c[0]).join("") === "ABCD"
  );
}

console.log("\n== Test 2: 200 biased questions are NOT all 'C' ==");
{
  const qs = Array.from({ length: 200 }, (_, i) => biasedQuestion(i));
  const shuffled = shuffleQuestions(qs, "lesson-bias-test");
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  shuffled.forEach((s) => (counts[s.answer] = (counts[s.answer] || 0) + 1));
  console.log("  letter distribution:", counts);
  check("answer 'C' is NOT used for every question", counts.C < 200);
  check("every letter A,B,C,D is used at least once",
    counts.A > 0 && counts.B > 0 && counts.C > 0 && counts.D > 0);
  // No letter should dominate wildly (each ~25%; allow generous band 10-45%).
  const within = Object.values(counts).every((c) => c >= 20 && c <= 90);
  check("distribution is reasonably even (no single letter dominates)", within,
    JSON.stringify(counts));
  // verify correctness preserved for ALL of them
  const allCorrect = shuffled.every((s) => {
    const t = s.choices.find((c) => c.startsWith(`${s.answer})`)) || "";
    return t.includes("right-");
  });
  check("correctness preserved across all 200", allCorrect);
}

console.log("\n== Test 3: no long runs of the same correct letter ==");
{
  const qs = Array.from({ length: 60 }, (_, i) => biasedQuestion(i));
  const shuffled = shuffleQuestions(qs, "lesson-runs");
  let maxRun = 1, run = 1;
  for (let i = 1; i < shuffled.length; i++) {
    if (shuffled[i].answer === shuffled[i - 1].answer) { run++; maxRun = Math.max(maxRun, run); }
    else run = 1;
  }
  console.log("  longest same-letter streak:", maxRun);
  check("no two adjacent questions share the same correct letter (max run = 1)", maxRun === 1);
}

console.log("\n== Test 4: adjacent questions never share identical option ordering ==");
{
  // Make every question have the SAME choice content so ordering is the only differ.
  const same = Array.from({ length: 40 }, (_, i) => ({
    prompt: `Q${i}`,
    choices: ["A) apple", "B) banana", "C) cherry", "D) date"],
    answer: "C",
    explanation: "",
  }));
  const shuffled = shuffleQuestions(same, "lesson-order");
  let clash = false;
  for (let i = 1; i < shuffled.length; i++) {
    const a = shuffled[i].choices.map((c) => c.replace(/^[A-D]\)\s*/, "")).join("|");
    const b = shuffled[i - 1].choices.map((c) => c.replace(/^[A-D]\)\s*/, "")).join("|");
    if (a === b) clash = true;
  }
  check("no adjacent pair has identical ordering", !clash);
}

console.log("\n== Test 5: determinism (same seed -> same result) ==");
{
  const q = biasedQuestion(7);
  const a = shuffleQuestion(q, "fixed");
  const b = shuffleQuestion(q, "fixed");
  check("same seed reproduces identical shuffle",
    JSON.stringify(a) === JSON.stringify(b));
}

console.log("\n== Test 6: malformed input is returned safely (not corrupted) ==");
{
  const noChoices = shuffleQuestion({ prompt: "x", choices: [], answer: "A" }, "s");
  check("question with no choices is untouched", noChoices.choices.length === 0);
  const oneChoice = shuffleQuestion({ prompt: "x", choices: ["A) only"], answer: "A" }, "s");
  check("question with one choice is untouched", oneChoice.choices.length === 1);
  // answer given as full text instead of letter
  const byText = shuffleQuestion(
    { prompt: "x", choices: ["A) red", "B) blue", "C) green"], answer: "blue" },
    "s"
  );
  const t = byText.choices.find((c) => c.startsWith(`${byText.answer})`)) || "";
  check("answer-by-text still resolves to correct choice", t.includes("blue"),
    `(answer=${byText.answer}, choice="${t}")`);
}

console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : failures + " TEST(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);

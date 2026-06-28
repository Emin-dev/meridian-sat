// ---------------------------------------------------------------------------
// Curated SAT content base — the "80%" grounded substrate.
// ---------------------------------------------------------------------------
// Every lesson the AI produces is GROUNDED in this vetted material rather than
// invented from scratch. This is the architecture all three council models
// converged on (RAG-style grounding): inject trusted source material and
// constrain the model to ADAPT/EXPLAIN it for the student, not fabricate new
// SAT rules or wrong worked solutions.
//
// Organized by the official College Board Digital SAT content domains so every
// lesson maps to a real exam skill, and tagged with difficulty so retrieval can
// be biased toward the student's level.
//
// This is a hand-curated, in-code knowledge base (no external vector DB needed
// for this app's scale). `selectCuratedSources()` filters the base to the
// chunks most relevant to a student's weak areas + section mix, and the result
// is injected into the generation prompt as APPROVED SOURCE MATERIAL.
// ---------------------------------------------------------------------------

export type SatSection = "Reading and Writing" | "Math";
export type SatDifficulty = "Foundations" | "Medium" | "Advanced";

export type CuratedChunk = {
  id: string;
  section: SatSection;
  domain: string; // official College Board content domain
  skill: string; // specific skill / topic
  difficulty: SatDifficulty;
  keywords: string[]; // for lightweight keyword retrieval against weak areas
  // The vetted teaching substance the model must ground its lesson in.
  concept: string;
  worked_example: string;
  common_misconceptions: string[];
};

// Official Digital SAT content domains (College Board), used to keep lessons
// exam-aligned and to map a student's weak areas to a real domain.
// https://satsuite.collegeboard.org/higher-ed-professionals/sat-validity/content-domains
export const SAT_DOMAINS: Record<SatSection, string[]> = {
  "Reading and Writing": [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
  ],
  Math: [
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
  ],
};

export const CURATED_BASE: CuratedChunk[] = [
  // ---------------- MATH: Algebra ----------------
  {
    id: "math.algebra.linear_equations",
    section: "Math",
    domain: "Algebra",
    skill: "Linear equations in one and two variables",
    difficulty: "Foundations",
    keywords: ["linear", "equation", "slope", "intercept", "line", "solve for x"],
    concept:
      "A linear equation graphs as a straight line \\( y = mx + b \\), where \\( m \\) is the slope (rate of change) and \\( b \\) is the y-intercept (value when \\( x = 0 \\)). To solve for a variable, isolate it by doing the same operation to both sides. Slope between two points is \\( m = \\frac{y_2 - y_1}{x_2 - x_1} \\).",
    worked_example:
      "Solve \\( 3x + 5 = 20 \\). Subtract 5 from both sides: \\( 3x = 15 \\). Divide by 3: \\( x = 5 \\). To check, substitute back: \\( 3(5) + 5 = 20 \\). True.",
    common_misconceptions: [
      "Forgetting to apply an operation to BOTH sides of the equation.",
      "Confusing slope (m) with the y-intercept (b).",
      "Sign errors when moving a term across the equals sign.",
    ],
  },
  {
    id: "math.algebra.systems",
    section: "Math",
    domain: "Algebra",
    skill: "Systems of linear equations",
    difficulty: "Medium",
    keywords: ["system", "systems", "substitution", "elimination", "two equations"],
    concept:
      "A system of two linear equations is solved where the lines intersect. Substitution: solve one equation for a variable and substitute into the other. Elimination: add or subtract the equations to cancel a variable. A system has one solution (lines cross), no solution (parallel), or infinitely many (same line).",
    worked_example:
      "Solve \\( \\begin{cases} y = 2x + 1 \\\\ 3x + y = 11 \\end{cases} \\). Substitute \\( y = 2x+1 \\): \\( 3x + (2x+1) = 11 \\Rightarrow 5x + 1 = 11 \\Rightarrow x = 2 \\). Then \\( y = 2(2)+1 = 5 \\). Solution \\( (2,5) \\).",
    common_misconceptions: [
      "Substituting into the SAME equation it was derived from (gives no new info).",
      "Sign errors during substitution, especially with negative coefficients.",
      "Forgetting to solve for the second variable after finding the first.",
    ],
  },
  {
    id: "math.algebra.inequalities",
    section: "Math",
    domain: "Algebra",
    skill: "Linear inequalities",
    difficulty: "Medium",
    keywords: ["inequality", "inequalities", "greater", "less than", "flip sign"],
    concept:
      "Solve linear inequalities like equations, with ONE crucial rule: when you multiply or divide both sides by a negative number, you must FLIP the inequality sign. The solution is a range of values, often shown on a number line.",
    worked_example:
      "Solve \\( -2x + 3 \\ge 9 \\). Subtract 3: \\( -2x \\ge 6 \\). Divide by \\(-2\\) and FLIP: \\( x \\le -3 \\).",
    common_misconceptions: [
      "Forgetting to flip the sign when dividing/multiplying by a negative.",
      "Treating the answer as a single value rather than a range.",
    ],
  },
  // ---------------- MATH: Advanced Math ----------------
  {
    id: "math.advanced.quadratics",
    section: "Math",
    domain: "Advanced Math",
    skill: "Quadratic equations and parabolas",
    difficulty: "Advanced",
    keywords: ["quadratic", "parabola", "factor", "vertex", "roots", "x^2"],
    concept:
      "A quadratic \\( ax^2 + bx + c = 0 \\) graphs as a parabola. Solve by factoring, completing the square, or the quadratic formula \\( x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\). The vertex is at \\( x = -\\frac{b}{2a} \\). The discriminant \\( b^2 - 4ac \\) tells you the number of real roots: positive = 2, zero = 1, negative = 0.",
    worked_example:
      "Solve \\( x^2 - 5x + 6 = 0 \\). Factor into \\( (x-2)(x-3) = 0 \\), so \\( x = 2 \\) or \\( x = 3 \\). Check: \\( 2 \\cdot 3 = 6 \\) (product of roots) and \\( 2 + 3 = 5 \\) (sum).",
    common_misconceptions: [
      "Sign errors in the quadratic formula, especially under the square root.",
      "Forgetting that a quadratic usually has TWO solutions.",
      "Dropping the \\( \\pm \\) and reporting only one root.",
    ],
  },
  {
    id: "math.advanced.functions",
    section: "Math",
    domain: "Advanced Math",
    skill: "Function notation and evaluation",
    difficulty: "Medium",
    keywords: ["function", "f(x)", "notation", "evaluate", "input output"],
    concept:
      "Function notation \\( f(x) \\) means 'the output of function f for input x.' To evaluate \\( f(3) \\), substitute 3 for every x. \\( f(x) = g(x) \\) is solved where the two functions are equal. Reading a function from a graph: the y-value at a given x is the output.",
    worked_example:
      "If \\( f(x) = 2x^2 - 1 \\), find \\( f(3) \\). Substitute: \\( f(3) = 2(3)^2 - 1 = 2(9) - 1 = 17 \\).",
    common_misconceptions: [
      "Reading \\( f(x) \\) as multiplication f times x.",
      "Squaring before substituting, or applying the exponent to the coefficient.",
    ],
  },
  // ---------------- MATH: Problem-Solving and Data Analysis ----------------
  {
    id: "math.data.ratios_percent",
    section: "Math",
    domain: "Problem-Solving and Data Analysis",
    skill: "Ratios, rates, proportions, and percentages",
    difficulty: "Foundations",
    keywords: ["ratio", "percent", "percentage", "proportion", "rate", "unit rate"],
    concept:
      "A percentage is a part out of 100: \\( \\text{percent} = \\frac{\\text{part}}{\\text{whole}} \\times 100 \\). A percent increase multiplies by \\( (1 + r) \\); a decrease by \\( (1 - r) \\). Proportions set two ratios equal and are solved by cross-multiplication.",
    worked_example:
      "A \\$80 jacket is discounted 25%. New price = \\( 80 \\times (1 - 0.25) = 80 \\times 0.75 = \\$60 \\).",
    common_misconceptions: [
      "Adding/subtracting the percent of the wrong base (e.g., taking percent of the discounted price).",
      "Confusing percent OF a number with percent CHANGE.",
    ],
  },
  {
    id: "math.data.tables_graphs",
    section: "Math",
    domain: "Problem-Solving and Data Analysis",
    skill: "Interpreting tables, graphs, and data",
    difficulty: "Medium",
    keywords: ["data", "table", "graph", "mean", "median", "interpret", "scatter"],
    concept:
      "Read axis labels and units before computing. Mean = sum ÷ count; median = middle value when sorted; mode = most frequent. A line of best fit on a scatterplot models a trend; its slope is the rate of change. Always check whether a question asks for a value, a difference, or a rate.",
    worked_example:
      "For the data 4, 8, 8, 10: mean = \\( \\frac{4+8+8+10}{4} = 7.5 \\); median = \\( \\frac{8+8}{2} = 8 \\); mode = 8.",
    common_misconceptions: [
      "Reading the wrong axis or ignoring units.",
      "Computing mean when the question asks for median (or vice versa).",
    ],
  },
  // ---------------- MATH: Geometry and Trigonometry ----------------
  {
    id: "math.geo.triangles",
    section: "Math",
    domain: "Geometry and Trigonometry",
    skill: "Triangles, Pythagorean theorem, and angles",
    difficulty: "Medium",
    keywords: ["triangle", "pythagorean", "angle", "right triangle", "hypotenuse"],
    concept:
      "Angles in a triangle sum to \\( 180^\\circ \\). For a right triangle, the Pythagorean theorem gives \\( a^2 + b^2 = c^2 \\), where c is the hypotenuse. Special right triangles: 3-4-5, 5-12-13, and the 30-60-90 and 45-45-90 ratios.",
    worked_example:
      "A right triangle has legs 6 and 8. The hypotenuse is \\( \\sqrt{6^2 + 8^2} = \\sqrt{36 + 64} = \\sqrt{100} = 10 \\).",
    common_misconceptions: [
      "Using the hypotenuse as a leg in \\( a^2 + b^2 = c^2 \\).",
      "Forgetting the angle sum is 180 degrees, not 360.",
    ],
  },
  // ---------------- READING & WRITING: Craft and Structure ----------------
  {
    id: "rw.craft.words_in_context",
    section: "Reading and Writing",
    domain: "Craft and Structure",
    skill: "Words in context (vocabulary)",
    difficulty: "Foundations",
    keywords: ["vocabulary", "words in context", "meaning", "word choice", "context"],
    concept:
      "The SAT asks for the word that best fits a sentence's meaning. Strategy: read the whole sentence, predict the meaning of the blank in YOUR OWN words, then match to the closest choice. Watch signal words (however, because, although) that tell you whether the missing word is positive, negative, or neutral.",
    worked_example:
      "'Although the critics praised the film, audiences found it ___.' The signal 'Although' sets up contrast, so the blank is negative — e.g., 'tedious' or 'disappointing,' not 'thrilling.'",
    common_misconceptions: [
      "Picking a word you know rather than the word the context demands.",
      "Ignoring contrast/cause signal words.",
    ],
  },
  {
    id: "rw.craft.text_structure",
    section: "Reading and Writing",
    domain: "Craft and Structure",
    skill: "Purpose and text structure",
    difficulty: "Medium",
    keywords: ["purpose", "structure", "main idea", "function", "passage"],
    concept:
      "Some questions ask the FUNCTION of a sentence or the overall PURPOSE of a passage. Ask: what job does this part do — introduce, support, contrast, illustrate, qualify? The answer must match the author's intent, not just be a true statement.",
    worked_example:
      "If a paragraph gives a counterexample after a claim, its function is 'to challenge/qualify the preceding claim,' not merely 'to provide information.'",
    common_misconceptions: [
      "Choosing a true-but-irrelevant statement over the one matching the author's purpose.",
      "Confusing the topic with the author's intent.",
    ],
  },
  // ---------------- READING & WRITING: Information and Ideas ----------------
  {
    id: "rw.info.command_of_evidence",
    section: "Reading and Writing",
    domain: "Information and Ideas",
    skill: "Command of evidence",
    difficulty: "Medium",
    keywords: ["evidence", "command of evidence", "support", "claim", "data"],
    concept:
      "Command-of-evidence questions ask which detail (text or a data point from a graph/table) best SUPPORTS a given claim. Strategy: pin down exactly what the claim asserts, then find the choice that directly and specifically backs THAT claim — not a related but off-target fact.",
    worked_example:
      "Claim: 'The new policy reduced commute times.' The supporting evidence must show a DECREASE in commute time after the policy — a choice about cost or ridership, however true, does not support this specific claim.",
    common_misconceptions: [
      "Selecting evidence that is true but supports a different claim.",
      "Picking the most dramatic statistic rather than the most relevant one.",
    ],
  },
  // ---------------- READING & WRITING: Expression of Ideas ----------------
  {
    id: "rw.expression.transitions",
    section: "Reading and Writing",
    domain: "Expression of Ideas",
    skill: "Transitions",
    difficulty: "Medium",
    keywords: ["transition", "however", "therefore", "furthermore", "logical"],
    concept:
      "Transition questions test the logical relationship between two sentences. Classify the relationship: contrast (however, nevertheless), cause/effect (therefore, consequently), addition (furthermore, moreover), or example (for instance). Cover the choices, decide the relationship yourself, then match.",
    worked_example:
      "'Sales fell sharply. ___, the company cut its workforce.' The second is a CONSEQUENCE of the first, so 'As a result' or 'Therefore' fits — not 'However.'",
    common_misconceptions: [
      "Choosing a transition by sound rather than by logical relationship.",
      "Defaulting to 'however' when the relationship is actually cause/effect.",
    ],
  },
  // ---------------- READING & WRITING: Standard English Conventions ----------------
  {
    id: "rw.conventions.punctuation",
    section: "Reading and Writing",
    domain: "Standard English Conventions",
    skill: "Punctuation and sentence boundaries",
    difficulty: "Medium",
    keywords: ["punctuation", "comma", "semicolon", "colon", "grammar", "sentence"],
    concept:
      "Two independent clauses can be joined by a period, a semicolon, or a comma + FANBOYS conjunction — but NOT a comma alone (that's a comma splice). A colon follows a complete sentence and introduces a list or explanation. Nonessential information is set off by a matching pair of commas (or dashes).",
    worked_example:
      "'The experiment failed; the team revised its method.' Two complete clauses correctly joined by a semicolon. A comma alone would be a comma splice.",
    common_misconceptions: [
      "Comma splices — joining two complete sentences with only a comma.",
      "Using a colon after an incomplete clause.",
      "Unmatched commas around a nonessential phrase.",
    ],
  },
  {
    id: "rw.conventions.agreement",
    section: "Reading and Writing",
    domain: "Standard English Conventions",
    skill: "Subject-verb and pronoun agreement",
    difficulty: "Foundations",
    keywords: ["agreement", "subject verb", "pronoun", "singular", "plural", "verb tense"],
    concept:
      "A verb must agree with its SUBJECT in number, even when words come between them. A pronoun must agree with its antecedent. Strategy: find the true subject (ignore prepositional phrases) and match the verb; for pronouns, find what the pronoun replaces.",
    worked_example:
      "'The box of nails IS heavy' — the subject is 'box' (singular), not 'nails,' so the verb is 'is,' not 'are.'",
    common_misconceptions: [
      "Matching the verb to the nearest noun instead of the true subject.",
      "Using a plural pronoun for a singular antecedent.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Lightweight retrieval: pick the curated chunks most relevant to a student.
// Scores each chunk by keyword overlap with the student's weak areas, biased
// toward the student's section needs and difficulty level, then returns the
// top-k. This is the "retrieval-side personalization" the council called for —
// the student profile biases WHAT source material is pulled, not just wording.
// ---------------------------------------------------------------------------
export function selectCuratedSources(
  weakAreas: string[],
  opts: { limit?: number; preferDifficulty?: SatDifficulty } = {}
): CuratedChunk[] {
  const limit = opts.limit ?? 6;
  const weakText = (weakAreas || []).join(" ").toLowerCase();
  const weakTokens = weakText.split(/[^a-z0-9]+/).filter((t) => t.length > 2);

  const scored = CURATED_BASE.map((chunk) => {
    let score = 0;
    const hay = (
      chunk.skill +
      " " +
      chunk.domain +
      " " +
      chunk.keywords.join(" ")
    ).toLowerCase();
    for (const kw of chunk.keywords) {
      if (weakText.includes(kw.toLowerCase())) score += 3;
    }
    for (const tok of weakTokens) {
      if (hay.includes(tok)) score += 1;
    }
    if (opts.preferDifficulty && chunk.difficulty === opts.preferDifficulty)
      score += 1;
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If nothing matched the weak areas (cold start), return a balanced spread
  // across both sections so the lesson still has grounded source material.
  const anyMatch = scored.some((s) => s.score > 0);
  if (!anyMatch) {
    const rw = CURATED_BASE.filter((c) => c.section === "Reading and Writing").slice(0, 3);
    const math = CURATED_BASE.filter((c) => c.section === "Math").slice(0, 3);
    return [...math, ...rw].slice(0, limit);
  }

  return scored.slice(0, limit).map((s) => s.chunk);
}

// Render selected curated chunks as APPROVED SOURCE MATERIAL for the prompt.
// The model is instructed to GROUND the lesson in this material (the 80%) and
// only generate personalized connective tissue (the 20%).
export function renderSourcePack(chunks: CuratedChunk[]): string {
  if (!chunks.length) return "";
  const blocks = chunks.map((c) => {
    return [
      `[SOURCE ${c.id}] (${c.section} - ${c.domain} - ${c.difficulty})`,
      `Skill: ${c.skill}`,
      `Concept: ${c.concept}`,
      `Worked example: ${c.worked_example}`,
      `Common misconceptions: ${c.common_misconceptions.join("; ")}`,
    ].join("\n");
  });
  return blocks.join("\n\n");
}

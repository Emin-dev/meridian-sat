import { NextRequest, NextResponse } from "next/server";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 30;

// Canonical option lists the model must choose from, so its output always maps
// cleanly onto the prebuilt dropdowns/chips in the New-student form.
const GRADES = [
  "9th grade",
  "10th grade",
  "11th grade",
  "12th grade",
  "Gap year",
  "Homeschool",
  "Adult learner",
];

const WEAK_AREAS = [
  "Words in context",
  "Text structure and purpose",
  "Cross-text connections",
  "Central ideas and details",
  "Command of evidence",
  "Inferences",
  "Boundaries (punctuation)",
  "Form, structure, and sense",
  "Transitions",
  "Rhetorical synthesis",
  "Linear equations",
  "Systems of equations",
  "Nonlinear functions",
  "Ratios, rates, and proportions",
  "Percentages",
  "Data analysis",
  "Probability and statistics",
  "Geometry and trigonometry",
  "Quadratics",
  "Exponents and radicals",
];

// POST /api/ai/suggest-profile
//   body: { name, grade?, target_score? }
//   -> a realistic, ready-to-save student profile. Everything except the name
//      is filled. Values are constrained to the canonical option lists so the
//      form's dropdowns/chips can select them directly.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json().catch(() => ({}));
    const name: string = (body?.name || "").trim();

    const system =
      "You set up a realistic Digital SAT student profile for a tutor. " +
      "Return VALID JSON only, no prose, with this exact shape: " +
      '{ "access_code": "<UPPERCASE letters+numbers, name-derived word + 2026, 6-14 chars>", ' +
      '"grade": "<one of the allowed grades>", ' +
      '"target_score": <one of 1600, 1550, 1500, 1450, 1400, 1300>, ' +
      '"weak_areas": ["<2-4 items chosen ONLY from the allowed weak areas>"], ' +
      '"cohort_tag": "<a short, friendly cohort name like \'Fall 2026 Cohort\' or \'Weekend Group\'>" }. ' +
      "Pick a plausible mix: a realistic target for the grade, and weak areas spread across both Reading/Writing and Math. " +
      "Use ONLY the allowed values for grade and weak_areas.";

    const user =
      `Student name: ${name || "Student"}.\n` +
      `Allowed grades: ${GRADES.join(", ")}.\n` +
      `Allowed weak areas: ${WEAK_AREAS.join(", ")}.\n` +
      (body?.grade ? `Tutor already set grade: ${body.grade}. Keep it.\n` : "") +
      (body?.target_score
        ? `Tutor already set target: ${body.target_score}. Keep it.\n`
        : "") +
      "Return the JSON profile now.";

    const raw = await aiComplete(system, user, { json: true, temperature: 0.8 });
    const p = parseJsonFromModel(raw) || {};

    // Sanitize / clamp everything so the client always receives valid options.
    const access_code = String(p.access_code || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 14);

    const grade = GRADES.includes(p.grade)
      ? p.grade
      : body?.grade || "11th grade";

    // Snap to the aspirational target set shown in the form.
    const TARGETS = [1600, 1550, 1500, 1450, 1400, 1300];
    let target = Number(p.target_score);
    if (!Number.isFinite(target)) target = body?.target_score || 1400;
    target = TARGETS.reduce((best, t) =>
      Math.abs(t - target) < Math.abs(best - target) ? t : best
    , 1400);

    const weak_areas = Array.isArray(p.weak_areas)
      ? p.weak_areas.filter((w: string) => WEAK_AREAS.includes(w)).slice(0, 4)
      : [];

    const cohort_tag =
      typeof p.cohort_tag === "string" && p.cohort_tag.trim()
        ? p.cohort_tag.trim().slice(0, 40)
        : "";

    return NextResponse.json({
      profile: {
        access_code: access_code || "STUDENT2026",
        grade,
        target_score: target,
        weak_areas: weak_areas.length
          ? weak_areas
          : ["Words in context", "Linear equations"],
        cohort_tag,
      },
    });
  } catch (err) {
    return apiError("ai/suggest-profile", err);
  }
}

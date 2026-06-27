import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import { summarizeEvents } from "@/lib/insights";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 60;

/**
 * Looks at how one student actually uses the app and proposes new, personalized
 * tools / pages / drills for them — e.g. exam-pacing practice for someone who
 * burns too long on exams, or vocab flashcards for a reading struggler.
 *
 * Crucially, every proposal is written into `student_tools` as status="pending".
 * Nothing reaches the student until a teacher approves it. This endpoint never
 * activates anything on its own.
 *
 * POST body: { studentId }
 * Returns:   { proposed: StudentTool[] }
 */

// The catalog of tools the system is allowed to propose. Keeping this fixed
// means every proposal maps to a real, buildable student-facing feature — the
// model only decides WHICH ones fit this student and how to phrase them.
const CATALOG = [
  {
    key: "exam_pacing",
    kind: "drill",
    icon: "timer",
    title: "Exam Pacing Drills",
    description: "Short timed sets that train you to move faster under exam conditions.",
    when: "Student spends a lot of time on exams or runs slow under time pressure.",
  },
  {
    key: "vocab_flashcards",
    kind: "tool",
    icon: "book-open",
    title: "Vocabulary Flashcards",
    description: "Quick daily flashcards for high-frequency SAT words.",
    when: "Student struggles with Reading & Writing or vocabulary-in-context.",
  },
  {
    key: "math_warmup",
    kind: "drill",
    icon: "calculator",
    title: "Daily Math Warm-up",
    description: "A 5-question warm-up to keep core math skills sharp.",
    when: "Student is weak in Math or has low practice accuracy on math.",
  },
  {
    key: "daily_streak",
    kind: "tool",
    icon: "flame",
    title: "Daily 10-Minute Habit",
    description: "A tiny daily goal to build a consistent study streak.",
    when: "Student studies infrequently or spends little time in the app.",
  },
  {
    key: "mistake_review",
    kind: "page",
    icon: "rotate-ccw",
    title: "Mistake Review",
    description: "Revisit the questions you got wrong and learn why.",
    when: "Student has answered practice questions but accuracy is low.",
  },
  {
    key: "confidence_boost",
    kind: "tool",
    icon: "heart",
    title: "Confidence Boosters",
    description: "Easier wins and encouragement to rebuild momentum.",
    when: "Student is discouraged, inactive, or struggling broadly.",
  },
  {
    key: "stretch_challenge",
    kind: "drill",
    icon: "trophy",
    title: "Stretch Challenges",
    description: "Harder questions to push a strong student further.",
    when: "Student is doing well — high accuracy and consistent study.",
  },
  {
    key: "reading_focus",
    kind: "page",
    icon: "glasses",
    title: "Reading Focus Lab",
    description: "Targeted passages and strategy for the Reading section.",
    when: "Student is weak specifically in Reading.",
  },
];

const ALLOWED = new Map(CATALOG.map((c) => [c.key, c]));

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { studentId } = await req.json();
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();

    const [{ data: student }, { data: events }, { data: progress }, { data: existingTools }] =
      await Promise.all([
        supabase.from("students").select("*").eq("id", studentId).single(),
        supabase
          .from("events")
          .select("type, duration_ms, meta, lesson_id, created_at")
          .eq("student_id", studentId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("progress").select("*").eq("student_id", studentId),
        supabase.from("student_tools").select("key").eq("student_id", studentId),
      ]);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const breakdown = summarizeEvents(events || []);
    const accuracy = breakdown.practiceAnswered
      ? Math.round((breakdown.practiceCorrect / breakdown.practiceAnswered) * 100)
      : null;
    // Don't re-propose tools the student already has (pending/approved/denied).
    const taken = new Set((existingTools || []).map((t: any) => t.key));
    const available = CATALOG.filter((c) => !taken.has(c.key));

    if (!available.length) {
      return NextResponse.json({ proposed: [], message: "No new tools to propose." });
    }

    // Derive a simple "doing well vs struggling" read for the model + fallback.
    const examShare = breakdown.totalSeconds
      ? breakdown.examSeconds / breakdown.totalSeconds
      : 0;
    const lowTime = breakdown.totalSeconds < 20 * 60; // < 20 min total
    const inactive = (breakdown.daysSinceActive ?? 0) >= 4;
    const struggling =
      (accuracy !== null && accuracy < 60) || lowTime || inactive || examShare > 0.5;
    const thriving = accuracy !== null && accuracy >= 80 && !lowTime && !inactive;

    let chosen: typeof CATALOG = [];

    // ---- model pass: pick the best-fit tools and write rationales ----------
    try {
      const facts = {
        name: student.name,
        targetScore: student.target_score,
        weakAreas: student.weak_areas || [],
        totalMinutes: Math.round(breakdown.totalSeconds / 60),
        lessonsOpened: breakdown.lessonsOpened,
        practiceAnswered: breakdown.practiceAnswered,
        practiceAccuracyPct: accuracy,
        examTimeSharePct: Math.round(examShare * 100),
        daysSinceActive: breakdown.daysSinceActive ?? 0,
        readMindset: thriving ? "thriving" : struggling ? "struggling" : "steady",
      };
      const catalogForModel = available.map((c) => ({
        key: c.key,
        title: c.title,
        fitsWhen: c.when,
      }));

      const system =
        "You quietly personalize a private SAT student's workspace. From a fixed catalog of tools, pick the 1-3 that best fit THIS student's real usage, and write a one-line reason for the teacher. Pick struggling-student tools for strugglers and stretch tools for thrivers. Never invent tools outside the catalog. Never mention AI. Return JSON only.";
      const user = `Student usage: ${JSON.stringify(facts)}

Tool catalog (choose only from these keys):
${JSON.stringify(catalogForModel, null, 2)}

Return STRICT JSON:
{ "tools": [ { "key": "<catalog key>", "rationale": "one short reason this fits this student, for the teacher" } ] }
Pick 1-3. Order best-fit first.`;
      const ai = parseJsonFromModel(
        await aiComplete(system, user, { json: true, temperature: 0.4 })
      );
      const picks: any[] = (ai?.tools || [])
        .filter((t: any) => t && ALLOWED.has(t.key) && !taken.has(t.key))
        .slice(0, 3);

      chosen = picks.map((p) => {
        const base = ALLOWED.get(p.key)!;
        return { ...base, rationale: String(p.rationale || base.when).slice(0, 200) } as any;
      });
    } catch {
      /* fall through to rule-based */
    }

    // ---- rule-based fallback so a proposal always happens ------------------
    if (!chosen.length) {
      const rank: string[] = [];
      if (examShare > 0.5) rank.push("exam_pacing");
      if (inactive || lowTime) rank.push("daily_streak");
      if (accuracy !== null && accuracy < 60) rank.push("mistake_review");
      if ((student.weak_areas || []).some((w: string) => /read|writ|vocab/i.test(w)))
        rank.push("vocab_flashcards", "reading_focus");
      if ((student.weak_areas || []).some((w: string) => /math|algebra|geom/i.test(w)))
        rank.push("math_warmup");
      if (struggling) rank.push("confidence_boost");
      if (thriving) rank.push("stretch_challenge");
      const seen = new Set<string>();
      for (const k of rank) {
        if (seen.has(k) || taken.has(k) || !ALLOWED.has(k)) continue;
        seen.add(k);
        const base = ALLOWED.get(k)!;
        chosen.push({ ...base, rationale: base.when } as any);
        if (chosen.length >= 3) break;
      }
      // Absolute last resort: propose the first available catalog item.
      if (!chosen.length && available[0]) {
        chosen.push({ ...available[0], rationale: available[0].when } as any);
      }
    }

    if (!chosen.length) {
      return NextResponse.json({ proposed: [], message: "No new tools to propose." });
    }

    // Persist proposals as PENDING — nothing is shown to the student yet.
    const rows = chosen.map((c: any) => ({
      student_id: studentId,
      status: "pending",
      kind: c.kind,
      key: c.key,
      title: c.title,
      description: c.description,
      icon: c.icon,
      rationale: c.rationale,
      source: "auto",
      config: {},
    }));

    const { data: inserted, error } = await supabase
      .from("student_tools")
      .upsert(rows, { onConflict: "student_id,key", ignoreDuplicates: true })
      .select("*");

    if (error) {
      return apiError("ai/propose-tools", error);
    }

    return NextResponse.json({ proposed: inserted || [] });
  } catch (err) {
    return apiError("ai/propose-tools", err);
  }
}

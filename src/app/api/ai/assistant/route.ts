import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import { summarizeEvents } from "@/lib/insights";
import { guardStudentAI } from "@/lib/ratelimit";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError } from "@/lib/api";

export const maxDuration = 60;

/**
 * The invisible helper. One endpoint that quietly reads the current state of
 * the workspace and returns a short, ranked list of "what you'll probably want
 * to do next" actions — for either an admin (teacher) or a student.
 *
 * Each action carries a machine-actionable `target` so the UI can act on it
 * directly (open a tab, jump to a lesson, focus a student). There is always a
 * rule-based result, so the helper never goes silent even if the model fails.
 *
 * Deliberately never mentions "AI" — it reads as a thoughtful assistant that
 * already knows the room.
 *
 * POST body:
 *   { role: "admin", tab?: string }
 *   { role: "student", studentId: string }
 */

type Action = {
  label: string;
  why: string;
  target: {
    tab?: string;
    lessonId?: string;
    studentId?: string;
    action?: string;
  };
};

const DAYS = (d: string | null | undefined) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role = body?.role === "student" ? "student" : "admin";
    const supabase = getSupabaseAdmin();

    if (role === "admin") {
      const unauth = requireAdmin(req);
      if (unauth) return unauth;
      return await adminAssistant(supabase, body?.tab || "review");
    }
    const unauth = requireStudent(req, body?.studentId);
    if (unauth) return unauth;
    return await studentAssistant(supabase, body?.studentId);
  } catch (err) {
    return apiError("ai/assistant", err);
  }
}

// ---------------------------------------------------------------------------
// ADMIN
// ---------------------------------------------------------------------------
async function adminAssistant(supabase: any, tab: string) {
  const [{ data: students }, { data: lessons }, { data: requests }] = await Promise.all([
    supabase.from("students").select("*"),
    supabase.from("lessons").select("id, title, student_id, status, section"),
    supabase.from("lesson_requests").select("id, student_id, status, created_at"),
  ]);

  const allStudents = students || [];
  const allLessons = lessons || [];
  const allRequests = requests || [];

  // Compute the facts that drive anticipation.
  const pending = allRequests.filter((r: any) => r.status === "pending");
  const drafts = allLessons.filter((l: any) => l.status === "draft");
  const studentName = (id: string) =>
    allStudents.find((s: any) => s.id === id)?.name || "a student";

  // At-risk: active students who haven't studied in a while.
  const atRisk = allStudents
    .filter((s: any) => s.status === "active")
    .map((s: any) => ({ s, days: DAYS(s.last_active_at) }))
    .filter((x: any) => x.days !== null && x.days >= 3)
    .sort((a: any, b: any) => (b.days ?? 0) - (a.days ?? 0));

  // Never-started: active students with zero study time.
  const neverStarted = allStudents.filter(
    (s: any) => s.status === "active" && (s.total_study_seconds || 0) === 0
  );

  // Students stuck in "preparing" (locked, waiting on the teacher to build).
  const preparing = allStudents.filter((s: any) => s.status === "preparing");

  // New students who finished onboarding but have no lessons yet.
  const newNoLessons = allStudents.filter(
    (s: any) =>
      s.onboarded &&
      s.status !== "active" &&
      !allLessons.some((l: any) => l.student_id === s.id)
  );

  // -- rule-based ranking (always present) --------------------------------
  const fallback: Action[] = [];

  if (pending.length) {
    fallback.push({
      label:
        pending.length === 1
          ? `Review ${studentName(pending[0].student_id)}'s lesson plan`
          : `Review ${pending.length} lesson plans waiting`,
      why: "A student is locked out until you approve their plan.",
      target: { tab: "review" },
    });
  }
  for (const x of atRisk.slice(0, 2)) {
    fallback.push({
      label: `Check in on ${x.s.name}`,
      why: `No study activity in ${x.days} days — they may be slipping.`,
      target: { tab: "insights", studentId: x.s.id },
    });
  }
  for (const s of neverStarted.slice(0, 1)) {
    fallback.push({
      label: `Nudge ${s.name} to begin`,
      why: "Lessons are live but they haven't started a single one.",
      target: { tab: "insights", studentId: s.id },
    });
  }
  if (drafts.length) {
    fallback.push({
      label:
        drafts.length === 1
          ? `Publish your draft lesson`
          : `Publish ${drafts.length} draft lessons`,
      why: "Drafts aren't visible to students until you publish them.",
      target: { tab: "lessons" },
    });
  }
  for (const s of preparing.slice(0, 1)) {
    fallback.push({
      label: `Build ${s.name}'s lessons`,
      why: "They're waiting on the locked screen for their plan.",
      target: { tab: "generate", studentId: s.id },
    });
  }
  for (const s of newNoLessons.slice(0, 1)) {
    fallback.push({
      label: `Start ${s.name}'s study plan`,
      why: "They finished onboarding but have no lessons yet.",
      target: { tab: "generate", studentId: s.id },
    });
  }
  if (!fallback.length) {
    fallback.push({
      label: "Review how your students are doing",
      why: "Everything's caught up — a good moment to scan progress.",
      target: { tab: "insights" },
    });
  }

  // -- model pass: rerank + phrase naturally for the current tab ----------
  try {
    const facts = {
      currentTab: tab,
      pendingReviews: pending.length,
      draftLessons: drafts.length,
      atRisk: atRisk.slice(0, 4).map((x: any) => ({
        id: x.s.id,
        name: x.s.name,
        daysInactive: x.days,
      })),
      neverStarted: neverStarted.slice(0, 4).map((s: any) => ({ id: s.id, name: s.name })),
      preparing: preparing.slice(0, 4).map((s: any) => ({ id: s.id, name: s.name })),
      newNoLessons: newNoLessons.slice(0, 4).map((s: any) => ({ id: s.id, name: s.name })),
      totalStudents: allStudents.length,
    };

    const system =
      "You quietly assist a private SAT teacher running their dashboard. Given the live state of their workspace and the tab they're on, decide the 1-3 highest-leverage things they'll most likely want to do next. Be specific, calm, and human — like a sharp assistant who already knows the room. Never mention AI. Return JSON only.";
    const user = `Workspace state: ${JSON.stringify(facts)}

Valid target.tab values: "review", "insights", "students", "lessons", "generate", "analytics", "prompts".
Prefer the most urgent/blocking items first (a pending review blocks a student; a draft is invisible to students; an inactive student is at risk).
If you reference a specific student, include their id as target.studentId.

Return STRICT JSON:
{ "actions": [ { "label": "<=6 words, imperative", "why": "one short reason", "target": { "tab": "<tab>", "studentId": "<id or omit>" } } ] }
Return at most 3 actions. If nothing is pending, suggest a useful review action.`;

    const ai = parseJsonFromModel(await aiComplete(system, user, { json: true, temperature: 0.4 }));
    const validTabs = new Set([
      "review",
      "insights",
      "students",
      "lessons",
      "generate",
      "analytics",
      "prompts",
    ]);
    const cleaned: Action[] = (ai?.actions || [])
      .filter((a: any) => a && a.label && a.target)
      .map((a: any) => ({
        label: String(a.label).slice(0, 60),
        why: String(a.why || "").slice(0, 120),
        target: {
          tab: validTabs.has(a.target?.tab) ? a.target.tab : "insights",
          studentId:
            a.target?.studentId &&
            allStudents.some((s: any) => s.id === a.target.studentId)
              ? a.target.studentId
              : undefined,
        },
      }))
      .slice(0, 3);

    if (cleaned.length) return NextResponse.json({ actions: cleaned });
  } catch {
    /* fall through to rule-based */
  }

  return NextResponse.json({ actions: fallback.slice(0, 3) });
}

// ---------------------------------------------------------------------------
// STUDENT
// ---------------------------------------------------------------------------
async function studentAssistant(supabase: any, studentId: string) {
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }
  const { blocked } = await guardStudentAI(studentId);
  if (blocked) return blocked;

  const [{ data: student }, { data: events }, { data: progress }, { data: lessons }] =
    await Promise.all([
      supabase.from("students").select("*").eq("id", studentId).single(),
      supabase
        .from("events")
        .select("type, duration_ms, meta, lesson_id, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("progress").select("*").eq("student_id", studentId),
      supabase
        .from("lessons")
        .select("id, title, topic, section, difficulty")
        .eq("student_id", studentId)
        .eq("status", "published"),
    ]);

  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  const breakdown = summarizeEvents(events || []);
  const doneIds = new Set(
    (progress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id)
  );
  const notDone = (lessons || []).filter((l: any) => !doneIds.has(l.id));
  const fallbackLesson = notDone[0] || null;

  // ---- read the student's state: thriving vs struggling -----------------
  const accuracy = breakdown.practiceAnswered
    ? Math.round((breakdown.practiceCorrect / breakdown.practiceAnswered) * 100)
    : null;
  const examShare = breakdown.totalSeconds
    ? breakdown.examSeconds / breakdown.totalSeconds
    : 0;
  const lowTime = breakdown.totalSeconds < 20 * 60; // < 20 min total in the app
  const inactive = (breakdown.daysSinceActive ?? 0) >= 4;
  const slowOnExams = examShare > 0.5;
  const struggling =
    (accuracy !== null && accuracy < 60) || lowTime || inactive || slowOnExams;
  const thriving = accuracy !== null && accuracy >= 80 && !lowTime && !inactive;
  const mood = thriving ? "thriving" : struggling ? "struggling" : "steady";

  // Tone guidance the model uses to motivate DIFFERENTLY by state.
  const toneGuide =
    mood === "thriving"
      ? "They're doing great. Celebrate progress and gently challenge them to stretch further."
      : mood === "struggling"
      ? "They're having a hard time (low time in the app, slow on exams, or low accuracy). Be extra warm, reassuring, and low-pressure. Suggest a small, easy win to rebuild momentum. Never make them feel behind."
      : "They're making steady progress. Keep them consistent and encouraged.";

  const actions: Action[] = [];
  if (fallbackLesson) {
    actions.push({
      label: `Continue “${fallbackLesson.title}”`,
      why:
        mood === "struggling"
          ? "A small step forward — you've got this."
          : "Pick up right where you left off.",
      target: { lessonId: fallbackLesson.id, action: "open_lesson" },
    });
  } else if ((lessons || []).length) {
    actions.push({
      label: "Review a past lesson",
      why: "Revisit one to keep your skills sharp.",
      target: { lessonId: (lessons || [])[0].id, action: "open_lesson" },
    });
  }

  try {
    const system =
      "You are a warm, encouraging study coach for one student. Suggest the 1-2 best things for them to do next right now, and adapt your TONE to how they're doing. Be specific and friendly. Never mention AI. Return JSON only.";
    const user = `Student: ${student.name}. Target score: ${student.target_score}. Weak areas: ${(student.weak_areas || []).join(", ") || "none noted"}.
State: ${mood.toUpperCase()}. ${toneGuide}
Study so far: ${Math.round(breakdown.totalSeconds / 60)} min total, ${breakdown.lessonsOpened} lessons opened, ${doneIds.size} completed, practice accuracy ${accuracy ?? "n/a"}%, ${Math.round(examShare * 100)}% of time on exams, ${breakdown.daysSinceActive ?? 0} days since last active.
Unfinished lessons: ${notDone.map((l: any) => `${l.id} | ${l.title} (${l.section})`).join("; ") || "none"}.

Return STRICT JSON:
{ "actions": [ { "label": "<=6 words friendly", "why": "one short, encouraging reason matched to their state", "lessonId": "<id of lesson to open, or null>" } ] }
Return 1-2 actions.`;
    const ai = parseJsonFromModel(await aiComplete(system, user, { json: true, temperature: 0.6 }));
    const cleaned: Action[] = (ai?.actions || [])
      .filter((a: any) => a && a.label)
      .map((a: any) => {
        const valid =
          a.lessonId && (lessons || []).find((l: any) => l.id === a.lessonId);
        return {
          label: String(a.label).slice(0, 60),
          why: String(a.why || "").slice(0, 120),
          target: valid
            ? { lessonId: a.lessonId, action: "open_lesson" }
            : { action: "none" },
        };
      })
      .slice(0, 2);
    if (cleaned.length) return NextResponse.json({ actions: cleaned, mood });
  } catch {
    /* fall through */
  }

  if (!actions.length) {
    actions.push({
      label: "Keep your streak going",
      why: "Great work so far — a short session keeps momentum.",
      target: { action: "none" },
    });
  }
  return NextResponse.json({ actions, mood });
}

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Engagement insights
// ---------------------------------------------------------------------------
// recomputeEngagement keeps a small set of rolling stats on the students row
// up to date every time new activity is logged. It is intentionally fast and
// synchronous — NO AI calls happen here. The heavier, AI-driven synthesis
// (labels, key points, recommendations) runs separately on demand.
// ---------------------------------------------------------------------------

type EventRow = {
  type: string;
  duration_ms?: number | null;
  meta?: Record<string, any> | null;
  created_at?: string | null;
};

// Event types that represent "time actually spent learning" and should add to
// the student's total study time. Pure navigation clicks are excluded.
const STUDY_TIME_TYPES = new Set([
  "reading_tick",
  "lesson_time",
  "practice_time",
  "exam_time",
  "plan_time",
]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

/**
 * Update rolling engagement stats for one student after new events arrive.
 * Reads the current row, folds in the new rows, writes back. Safe to call on
 * every /api/events POST.
 */
export async function recomputeEngagement(
  supabase: SupabaseClient,
  studentId: string,
  newRows: EventRow[]
): Promise<void> {
  if (!studentId) return;

  // Current student snapshot (only the fields we touch).
  const { data: student } = await supabase
    .from("students")
    .select(
      "total_study_seconds, last_active_at, streak_days, created_at"
    )
    .eq("id", studentId)
    .single();

  if (!student) return;

  const now = new Date();

  // --- total study seconds ------------------------------------------------
  let addedMs = 0;
  for (const r of newRows) {
    if (STUDY_TIME_TYPES.has(r.type) && r.duration_ms) {
      addedMs += Math.max(0, r.duration_ms);
    }
  }
  const totalStudySeconds =
    (student.total_study_seconds || 0) + Math.round(addedMs / 1000);

  // --- streak -------------------------------------------------------------
  // If the last active day was yesterday, increment streak. If today, keep it.
  // If it's been longer (or never), reset to 1.
  const prevActive = student.last_active_at
    ? new Date(student.last_active_at)
    : null;
  let streak = student.streak_days || 0;
  if (!prevActive) {
    streak = 1;
  } else {
    const dayDiff = Math.round(
      (startOfDay(now) - startOfDay(prevActive)) / MS_PER_DAY
    );
    if (dayDiff === 0) {
      streak = Math.max(1, streak);
    } else if (dayDiff === 1) {
      streak = (streak || 0) + 1;
    } else {
      streak = 1;
    }
  }

  // --- engagement score (0-100) ------------------------------------------
  // A lightweight composite of recency, total time invested, and streak.
  // recency: active today = full marks, decays over ~10 days.
  const lastSeen = now; // we just received activity, so "now" is the recency anchor
  const recencyScore = 40; // active right now

  // time: ~0 at 0h, saturates around 20h of total study.
  const hours = totalStudySeconds / 3600;
  const timeScore = Math.min(35, Math.round((hours / 20) * 35));

  // streak: saturates around a 14-day streak.
  const streakScore = Math.min(25, Math.round((streak / 14) * 25));

  const engagementScore = Math.max(
    0,
    Math.min(100, recencyScore + timeScore + streakScore)
  );

  await supabase
    .from("students")
    .update({
      total_study_seconds: totalStudySeconds,
      last_active_at: lastSeen.toISOString(),
      streak_days: streak,
      engagement_score: engagementScore,
    })
    .eq("id", studentId);
}

// ---------------------------------------------------------------------------
// Derived helpers used by admin views and the suggestion engine.
// ---------------------------------------------------------------------------

export type StudyBreakdown = {
  readingSeconds: number;
  practiceSeconds: number;
  examSeconds: number;
  planSeconds: number;
  totalSeconds: number;
  lessonsOpened: number;
  practiceAnswered: number;
  practiceCorrect: number;
  examsTaken: number;
  lastActiveAt: string | null;
  daysSinceActive: number | null;
  sessions: number;
};

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min gap = new session

/**
 * Roll a flat list of events into a per-student breakdown of how time was
 * actually spent (reading vs practice vs exam) plus simple counts. Pure
 * function — no DB, no AI. Used by admin insights and the suggestion engine.
 */
export function summarizeEvents(events: EventRow[]): StudyBreakdown {
  let readingSeconds = 0;
  let practiceSeconds = 0;
  let examSeconds = 0;
  let planSeconds = 0;
  let lessonsOpened = 0;
  let practiceAnswered = 0;
  let practiceCorrect = 0;
  let examsTaken = 0;

  // sessions: sort by time, count gaps > 30 min
  const times = events
    .map((e) => (e.created_at ? new Date(e.created_at).getTime() : 0))
    .filter((t) => t > 0)
    .sort((a, b) => a - b);
  let sessions = times.length > 0 ? 1 : 0;
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > SESSION_GAP_MS) sessions++;
  }

  for (const e of events) {
    const secs = e.duration_ms ? e.duration_ms / 1000 : 0;
    switch (e.type) {
      case "reading_tick":
      case "lesson_time":
        readingSeconds += secs;
        break;
      case "practice_time":
        practiceSeconds += secs;
        break;
      case "exam_time":
        examSeconds += secs;
        break;
      case "plan_time":
        planSeconds += secs;
        break;
      case "lesson_open":
        lessonsOpened++;
        break;
      case "practice_answer":
        practiceAnswered++;
        if (e.meta?.correct) practiceCorrect++;
        break;
      case "exam_submit":
        examsTaken++;
        break;
    }
  }

  const lastTime = times.length ? times[times.length - 1] : 0;
  const lastActiveAt = lastTime ? new Date(lastTime).toISOString() : null;
  const daysSinceActive = lastTime
    ? Math.floor((Date.now() - lastTime) / MS_PER_DAY)
    : null;

  return {
    readingSeconds: Math.round(readingSeconds),
    practiceSeconds: Math.round(practiceSeconds),
    examSeconds: Math.round(examSeconds),
    planSeconds: Math.round(planSeconds),
    totalSeconds: Math.round(
      readingSeconds + practiceSeconds + examSeconds + planSeconds
    ),
    lessonsOpened,
    practiceAnswered,
    practiceCorrect,
    examsTaken,
    lastActiveAt,
    daysSinceActive,
    sessions,
  };
}

/**
 * Quick rule-based status label, used as an instant fallback before / alongside
 * the AI-generated labels. Keeps the admin list meaningful even without AI.
 */
export function quickLabel(breakdown: StudyBreakdown): {
  label: string;
  tone: "good" | "warn" | "risk";
} {
  const { daysSinceActive, totalSeconds, practiceAnswered } = breakdown;
  if (daysSinceActive === null) return { label: "Not started", tone: "warn" };
  if (daysSinceActive >= 7) return { label: "At risk", tone: "risk" };
  if (daysSinceActive >= 3) return { label: "Slipping", tone: "warn" };
  if (totalSeconds > 3600 && practiceAnswered > 10)
    return { label: "On track", tone: "good" };
  if (totalSeconds > 600) return { label: "Getting started", tone: "good" };
  return { label: "Low activity", tone: "warn" };
}

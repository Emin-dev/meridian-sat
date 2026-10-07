/** Explicit student-facing contract. New database columns stay private by default. */
const STUDENT_FIELDS = [
  "id", "name", "grade", "target_score", "weak_areas", "onboarded", "status",
  "survey", "created_at", "total_study_seconds", "last_active_at", "streak_days",
] as const;
export function studentView(student: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const key of STUDENT_FIELDS) safe[key] = student[key];
  // The review workflow publishes these only when the teacher activates a student.
  safe.study_plan = student.status === "active" ? student.study_plan : "";
  safe.ai_summary = student.status === "active" ? student.ai_summary : "";
  return safe;
}

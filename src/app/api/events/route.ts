import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recomputeEngagement } from "@/lib/insights";
import { apiError, badRequest, reqId } from "@/lib/api";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { ownsPublishedLessons } from "@/lib/lesson-access";

const TYPES = new Set(["login", "lesson_open", "practice_answer", "exam_submit", "tool_open",
  "reading_tick", "lesson_time", "practice_time", "exam_time", "plan_time"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentId = reqId(body?.studentId);
    if (!studentId) return badRequest("A valid studentId is required.");
    const unauth = await requireStudent(req, studentId);
    if (unauth) return unauth;
    const incoming = Array.isArray(body.batch) ? body.batch : [body];
    if (incoming.length > 25) return badRequest("Too many events.");
    const rows = [];
    for (const event of incoming) {
      if (!event || !TYPES.has(event.type)) return badRequest("Invalid event type.");
      const lessonId = event.lessonId == null ? null : reqId(event.lessonId);
      if (event.lessonId != null && !lessonId) return badRequest("Invalid lesson id.");
      const duration = event.durationMs ?? 0;
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > 3600000) {
        return badRequest("Invalid event duration.");
      }
      const meta = event.meta ?? {};
      if (typeof meta !== "object" || Array.isArray(meta) || meta === null || JSON.stringify(meta).length > 4096) {
        return badRequest("Invalid event details.");
      }
      rows.push({ student_id: studentId, lesson_id: lessonId, type: event.type, meta, duration_ms: Math.round(duration) });
    }
    if (!await ownsPublishedLessons(studentId, rows.flatMap(r => r.lesson_id ? [r.lesson_id] : []), !requireAdmin(req))) {
      return badRequest("Lesson unavailable.");
    }
    if (!rows.length) return NextResponse.json({ ok: true, inserted: 0 });
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("events").insert(rows);
    if (error) return apiError("events", error);
    await recomputeEngagement(supabase, studentId, rows);
    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err) { return apiError("events", err); }
}

/** Activity history is a teacher-only view. */
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { searchParams } = req.nextUrl;
    const studentId = searchParams.get("studentId");
    const limit = Number(searchParams.get("limit") || 500);
    if (!Number.isInteger(limit) || limit < 1 || limit > 2000) return badRequest("Invalid limit.");
    let q = getSupabaseAdmin().from("events").select("*")
      .order("created_at", { ascending: false }).limit(limit);
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return apiError("events", error);
    return NextResponse.json({ events: data || [] });
  } catch (err) { return apiError("events", err); }
}

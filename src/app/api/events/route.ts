import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recomputeEngagement } from "@/lib/insights";
import { apiError } from "@/lib/api";

// POST /api/events
// body: { studentId, type, lessonId?, meta?, durationMs? }
//   OR  { studentId, batch: [{ type, lessonId?, meta?, durationMs? }, ...] }
// Records granular activity for a student. Lightweight, fire-and-forget from client.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentId = body.studentId;
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();

    const incoming: any[] = Array.isArray(body.batch)
      ? body.batch
      : [{ type: body.type, lessonId: body.lessonId, meta: body.meta, durationMs: body.durationMs }];

    const rows = incoming
      .filter((e) => e && e.type)
      .map((e) => ({
        student_id: studentId,
        lesson_id: e.lessonId || null,
        type: e.type,
        meta: e.meta || {},
        duration_ms: Math.max(0, Math.round(e.durationMs || 0)),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0 });
    }

    const { error } = await supabase.from("events").insert(rows);
    if (error) return apiError("events", error, 500);

    // Update lightweight rolling engagement stats (sync, fast, no AI call).
    await recomputeEngagement(supabase, studentId, rows);

    return NextResponse.json({ ok: true, inserted: rows.length });
  } catch (err) {
    return apiError("events", err);
  }
}

// GET /api/events?studentId=...&limit=...  -> recent events (admin views)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    const limit = Math.min(Number(searchParams.get("limit") || 500), 2000);
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return apiError("events", error, 500);
    return NextResponse.json({ events: data || [] });
  } catch (err) {
    return apiError("events", err);
  }
}

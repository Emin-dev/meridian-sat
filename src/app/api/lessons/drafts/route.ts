import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError, ok } from "@/lib/api";

// GET /api/lessons/drafts
// Admin-only. Returns the set of auto-generated DRAFT lessons awaiting review,
// grouped by student, so the admin panel can raise its global "ready to review"
// alarm (a bell + count) and a per-student draft badge. Polled by the dashboard.
//
// Response: { totalDrafts, students: [{ studentId, count }] }
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lessons")
      .select("student_id")
      .eq("status", "draft");
    if (error) return apiError("lessons:drafts", error);

    const counts = new Map<string, number>();
    for (const row of data || []) {
      const id = (row as any).student_id as string;
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    const students = Array.from(counts.entries()).map(([studentId, count]) => ({
      studentId,
      count,
    }));
    const totalDrafts = students.reduce((s, x) => s + x.count, 0);

    return ok({ totalDrafts, students });
  } catch (err) {
    return apiError("lessons:drafts", err);
  }
}

import { getSupabaseAdmin } from "@/lib/supabase";

/** Prevent cross-student foreign-key writes, including unpublished lesson IDs. */
export async function ownsPublishedLessons(studentId: string, ids: string[], admin = false) {
  if (!ids.length) return true;
  let query = getSupabaseAdmin().from("lessons").select("id")
    .eq("student_id", studentId).in("id", Array.from(new Set(ids)));
  if (!admin) query = query.eq("status", "published");
  const { data, error } = await query;
  if (error) throw error;
  return new Set((data || []).map(row => row.id)).size === new Set(ids).size;
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

// GET /api/students -> list all students (admin only)
export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return apiError("students", error, 500);
    return NextResponse.json({ students: data });
  } catch (err) {
    return apiError("students", err);
  }
}

// PATCH /api/students -> bulk-update tags for many students at once (admin only).
// Body: { ids: string[], add?: string[], remove?: string[], set?: string[] }
// - add: union these tags into each student's existing tags
// - remove: drop these tags from each student
// - set: replace each student's tags entirely (mutually exclusive with add/remove)
export async function PATCH(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) return apiError("students:PATCH", "no ids", 400, "No students selected.");
    const clean = (a: any) =>
      Array.isArray(a)
        ? Array.from(
            new Set(a.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0 && t.length <= 40))
          )
        : [];
    const add = clean(body.add);
    const remove = clean(body.remove);
    const set = body.set !== undefined ? clean(body.set) : null;

    const supabase = getSupabaseAdmin();
    // Read current tags so add/remove operate per-student.
    const { data: current, error: readErr } = await supabase
      .from("students")
      .select("id, tags")
      .in("id", ids);
    if (readErr) return apiError("students:PATCH", readErr, 500);

    const updated: any[] = [];
    for (const row of current || []) {
      let next: string[];
      if (set !== null) {
        next = set;
      } else {
        const existing = Array.isArray(row.tags) ? row.tags : [];
        const withAdd = Array.from(new Set([...existing, ...add]));
        next = withAdd.filter((t: string) => !remove.includes(t));
      }
      const { data, error } = await supabase
        .from("students")
        .update({ tags: next })
        .eq("id", row.id)
        .select()
        .single();
      if (error) return apiError("students:PATCH", error, 500);
      updated.push(data);
    }
    return NextResponse.json({ students: updated });
  } catch (err) {
    return apiError("students:PATCH", err);
  }
}

// POST /api/students -> create a student (admin only)
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .insert({
        name: body.name,
        access_code: body.access_code,
        grade: body.grade || null,
        target_score: body.target_score ?? 1400,
        weak_areas: body.weak_areas || [],
        notes: body.notes || "",
        tags: Array.isArray(body.tags) ? body.tags : [],
      })
      .select()
      .single();
    if (error) return apiError("students", error, 500);
    return NextResponse.json({ student: data });
  } catch (err) {
    return apiError("students", err);
  }
}

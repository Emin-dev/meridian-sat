import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/progress?studentId=...  -> progress rows
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    const supabase = getSupabaseAdmin();
    let q = supabase.from("progress").select("*");
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ progress: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/progress -> upsert a student's result on a lesson
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    // does a row already exist?
    const { data: existing } = await supabase
      .from("progress")
      .select("id")
      .eq("student_id", body.student_id)
      .eq("lesson_id", body.lesson_id)
      .maybeSingle();

    const payload = {
      student_id: body.student_id,
      lesson_id: body.lesson_id,
      completed: body.completed ?? true,
      score: body.score ?? null,
      total_q: body.total_q ?? 0,
      correct_q: body.correct_q ?? 0,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      result = await supabase
        .from("progress")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase.from("progress").insert(payload).select().single();
    }
    if (result.error)
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ progress: result.data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// GET /api/lessons?studentId=...  -> lessons for a student (or all if omitted)
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    const supabase = getSupabaseAdmin();
    let q = supabase.from("lessons").select("*").order("created_at", { ascending: false });
    if (studentId) q = q.eq("student_id", studentId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lessons: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/lessons -> create a lesson manually (admin)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        student_id: body.student_id,
        title: body.title,
        section: body.section,
        topic: body.topic,
        difficulty: body.difficulty || "medium",
        content: body.content || "",
        questions: body.questions || [],
        study_plan: body.study_plan || "",
        status: body.status || "published",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lesson: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

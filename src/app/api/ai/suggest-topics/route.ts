import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";

export const maxDuration = 30;

// POST /api/ai/suggest-topics  body: { studentId?, section }
// Suggests relevant SAT topics for the section, personalized to the student's weak areas.
export async function POST(req: NextRequest) {
  try {
    const { studentId, section } = await req.json();
    let weak: string[] = [];
    let name = "the student";
    if (studentId) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("students")
        .select("name, weak_areas")
        .eq("id", studentId)
        .single();
      if (data) {
        weak = data.weak_areas || [];
        name = data.name;
      }
    }
    const system =
      "You suggest official Digital SAT topics. Return valid JSON only: { \"topics\": [\"...\", ...] } with 6 concise, real SAT topic names for the requested section. If the student has weak areas in this section, prioritize and include them first.";
    const raw = await aiComplete(
      system,
      `Section: ${section}. Student: ${name}. Known weak areas: ${
        weak.join(", ") || "none"
      }. Suggest 6 topics.`,
      { json: true, temperature: 0.6 }
    );
    const parsed = parseJsonFromModel(raw);
    return NextResponse.json({ topics: parsed.topics || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, topics: [] }, { status: 500 });
  }
}

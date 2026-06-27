import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/deepseek";
import { requireAdmin } from "@/lib/adminauth";

export const maxDuration = 30;

// POST /api/ai/suggest-code  body: { name }
// Suggests a memorable, clean access code based on the student's name.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { name } = await req.json();
    const system =
      "You generate short, memorable, uppercase access codes for students. Return ONLY the code, no quotes, no extra text. Format: a name-derived word plus the current year, 6-14 chars, letters and numbers only, easy to type.";
    const raw = await aiComplete(
      system,
      `Student name: ${name || "Student"}. Year: 2026. Give one access code.`,
      { temperature: 0.9 }
    );
    const code = (raw || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 14);
    return NextResponse.json({ code: code || "STUDENT2026" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

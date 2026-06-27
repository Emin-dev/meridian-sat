import { NextRequest, NextResponse } from "next/server";
import { peekUsage, grantBonus } from "@/lib/ratelimit";
import { requireAdmin } from "@/lib/adminauth";

// GET /api/ai-usage?studentId=...  -> current daily usage status for a student
// Used by both the student's screen (their meter) and the admin student page.
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const status = await peekUsage(studentId);
    return NextResponse.json({ rate: status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

// POST /api/ai-usage  body: { studentId, grant }  (admin only, behind admin UI)
// Grant a student extra requests for today; clears any active block.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const { studentId, grant } = await req.json();
    if (!studentId || typeof grant !== "number" || grant <= 0) {
      return NextResponse.json(
        { error: "studentId and a positive grant are required." },
        { status: 400 }
      );
    }
    const status = await grantBonus(studentId, Math.min(grant, 1000));
    return NextResponse.json({ rate: status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

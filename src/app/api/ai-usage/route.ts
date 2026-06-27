import { NextRequest } from "next/server";
import { peekUsage, grantBonus } from "@/lib/ratelimit";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, badRequest, ok, parseJsonBody } from "@/lib/api";

// GET /api/ai-usage?studentId=...  -> current daily usage status for a student.
// Used by the student's own meter and the admin student page; the caller must
// own the id (or be admin).
export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return badRequest("studentId required");
  const unauth = requireStudent(req, studentId);
  if (unauth) return unauth;
  try {
    const status = await peekUsage(studentId);
    return ok({ rate: status });
  } catch (err) {
    return apiError("ai-usage:GET", err);
  }
}

// POST /api/ai-usage  body: { studentId, grant }  (admin only, behind admin UI)
// Grant a student extra requests for today; clears any active block.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  try {
    const body = await parseJsonBody<{ studentId?: string; grant?: number }>(req);
    const studentId = body?.studentId;
    const grant = body?.grant;
    if (!studentId || typeof grant !== "number" || grant <= 0) {
      return badRequest("studentId and a positive grant are required.");
    }
    const status = await grantBonus(studentId, Math.min(grant, 1000));
    return ok({ rate: status });
  } catch (err) {
    return apiError("ai-usage:POST", err);
  }
}

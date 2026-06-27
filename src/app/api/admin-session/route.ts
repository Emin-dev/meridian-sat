import { NextRequest, NextResponse } from "next/server";
import { isValidAdminToken } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

// GET /api/admin-session -> validate the httpOnly admin cookie and, if valid,
// return the token so the SPA can restore the in-memory admin session on refresh.
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("meridian_admin")?.value;
    if (!isValidAdminToken(token)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, token });
  } catch (err) {
    return apiError("admin-session", err);
  }
}

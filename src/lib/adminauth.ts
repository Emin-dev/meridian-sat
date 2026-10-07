import { NextRequest, NextResponse } from "next/server";
import { issueSession, validSession } from "@/lib/session";

export function adminToken(): string {
  return issueSession("meridian-admin-v2", process.env.ADMIN_PASSWORD || "");
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  return validSession(token, "meridian-admin-v2", process.env.ADMIN_PASSWORD || "");
}

/** API calls require the explicit header, avoiding ambient-cookie CSRF. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  return isValidAdminToken(req.headers.get("x-admin-token")) ? null :
    NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

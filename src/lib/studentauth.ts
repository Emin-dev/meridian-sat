import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidAdminToken } from "@/lib/adminauth";

/**
 * Lightweight per-student authorization for API routes.
 *
 * A student signs in with their access code (verified server-side in
 * /api/student-auth). On success we issue a token derived by HMAC from the
 * student's id, keyed by a server secret. The browser keeps the token in memory
 * and sends it as the `x-student-token` header on every student call.
 *
 * Routes that serve a single student's data call requireStudent(req, id) so a
 * student can only read/write THEIR OWN record — previously the id came straight
 * from the URL (?id=...) and could be swapped to impersonate another student.
 *
 * The signing secret prefers a dedicated STUDENT_TOKEN_SECRET, then falls back
 * to ADMIN_PASSWORD so the app keeps working without extra config. The token
 * never exposes the secret and can't be forged for an id you don't own.
 */

function secret(): string {
  return (
    process.env.STUDENT_TOKEN_SECRET ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

export function studentToken(studentId: string): string {
  // HMAC over the student id keyed by the secret → stable, unguessable, per-id.
  return createHmac("sha256", secret())
    .update(`meridian-student-v1:${studentId}`)
    .digest("hex");
}

export function isValidStudentToken(
  studentId: string,
  token: string | null | undefined
): boolean {
  if (!secret()) return false;
  if (!token || !studentId) return false;
  const expected = studentToken(studentId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Returns a 401 NextResponse if the request does not carry a valid token for
 * `studentId`, otherwise null (meaning: proceed). Admins are also allowed
 * through (they legitimately act on any student) when an admin token is present.
 */
export function requireStudent(
  req: NextRequest,
  studentId: string
): NextResponse | null {
  const sToken = req.headers.get("x-student-token");
  if (isValidStudentToken(studentId, sToken)) return null;

  // Allow an authenticated admin to access any student's data.
  const adminTok = req.headers.get("x-admin-token");
  if (adminTok && isValidAdminToken(adminTok)) return null;

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

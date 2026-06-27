import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight admin authorization for API routes.
 *
 * The admin signs in with ADMIN_PASSWORD (verified server-side in /api/admin-auth),
 * which returns a token derived by HMAC from the password. The browser keeps the
 * token in memory and sends it as the `x-admin-token` header on every admin call.
 * Routes call requireAdmin(req) to reject anyone without a valid token.
 *
 * This is not a full identity system, but it closes the hole where admin endpoints
 * were callable by anyone. The token can't be forged without ADMIN_PASSWORD, and
 * it never exposes the raw password to the client.
 */

export function adminToken(): string {
  const secret = process.env.ADMIN_PASSWORD || "";
  // HMAC over a fixed label keyed by the password → stable, unguessable token.
  return createHmac("sha256", secret).update("meridian-admin-v1").digest("hex");
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  if (!process.env.ADMIN_PASSWORD) return false;
  if (!token) return false;
  const expected = adminToken();
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
 * Returns a 401 NextResponse if the request is not an authenticated admin,
 * otherwise null (meaning: proceed).
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.headers.get("x-admin-token");
  if (!isValidAdminToken(token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

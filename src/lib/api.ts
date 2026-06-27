import { NextResponse } from "next/server";

/**
 * Shared API helpers — consistent error handling + less route boilerplate.
 *
 * Previously every route did `catch (err) { return ...err.message }`, which
 * leaked internal error text (DB messages, stack hints) to the client. These
 * helpers log the full error server-side and return a safe, generic message.
 */

/** Log an error server-side and return a generic JSON error response. */
export function apiError(
  context: string,
  err: unknown,
  status = 500,
  publicMessage = "Something went wrong. Please try again."
): NextResponse {
  // Full detail stays on the server (visible in Vercel logs / Sentry).
  console.error(`[api:${context}]`, err);
  return NextResponse.json({ error: publicMessage }, { status });
}

/** A client-safe 400 for bad/missing input. The message IS shown to the user. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Standard JSON success. */
export function ok<T extends Record<string, unknown>>(body: T): NextResponse {
  return NextResponse.json(body);
}

/** Parse a JSON body safely; returns null if the body is missing/invalid. */
export async function parseJsonBody<T = any>(
  req: Request
): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Trim + validate a non-empty string. Returns the trimmed value or null. */
export function reqString(
  v: unknown,
  { max = 5000 }: { max?: number } = {}
): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

/** Validate a UUID-ish id (Supabase ids). Returns the id or null. */
export function reqId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  // UUID v4-ish; permissive enough for Supabase-generated ids.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t))
    return null;
  return t;
}

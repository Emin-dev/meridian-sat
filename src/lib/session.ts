import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_SECONDS = 8 * 60 * 60;
type Session = { subject: string; expires: number; nonce: string };

/** Short-lived, purpose-separated sessions; no credentials appear in the payload. */
export function issueSession(subject: string, key: string, now = Date.now()): string {
  if (!key) throw new Error("Session signing is not configured.");
  const payload = Buffer.from(JSON.stringify({
    subject, expires: Math.floor(now / 1000) + SESSION_SECONDS,
    nonce: randomBytes(16).toString("hex"),
  })).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

export function validSession(token: string | null | undefined, subject: string, key: string, now = Date.now()): boolean {
  if (!key || !token || token.length > 2048) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    const seconds = Math.floor(now / 1000);
    return value.subject === subject && typeof value.nonce === "string" &&
      value.nonce.length === 32 && Number.isSafeInteger(value.expires) &&
      value.expires > seconds && value.expires <= seconds + SESSION_SECONDS;
  } catch { return false; }
}

"use client";

/**
 * Client-side admin session token.
 *
 * After a successful password login, /api/admin-auth returns a token. We keep it
 * in a module-level variable (in memory — no localStorage, which is unreliable
 * inside sandboxed iframes) and attach it as the `x-admin-token` header on every
 * admin API request via adminFetch().
 *
 * On a hard refresh the in-memory token is lost, but the session is also backed
 * by an httpOnly cookie set at login. restoreAdminSession() exchanges that cookie
 * for the token via /api/admin-session, so any admin page can recover silently
 * after a refresh instead of bouncing the admin back to the password screen.
 */

let token: string | null = null;

export function setAdminToken(t: string | null) {
  token = t;
}

export function getAdminToken(): string | null {
  return token;
}

/**
 * Restore the admin token from the httpOnly session cookie. Returns true if a
 * valid session was found (and sets the in-memory token), false otherwise.
 */
export async function restoreAdminSession(): Promise<boolean> {
  if (token) return true;
  try {
    const res = await fetch("/api/admin-session");
    if (!res.ok) return false;
    const d = await res.json().catch(() => ({}));
    if (d.token) {
      token = d.token;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** fetch() wrapper that injects the admin token header. */
export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-admin-token", token);
  return fetch(input, { ...init, headers });
}

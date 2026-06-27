"use client";

/**
 * Client-side admin session token.
 *
 * After a successful password login, /api/admin-auth returns a token. We keep it
 * in a module-level variable (in memory — no localStorage, which is unreliable
 * inside sandboxed iframes) and attach it as the `x-admin-token` header on every
 * admin API request via adminFetch().
 *
 * On a hard refresh the token is lost and the admin re-enters the password; the
 * admin page already supports fast (debounced) re-login.
 */

let token: string | null = null;

export function setAdminToken(t: string | null) {
  token = t;
}

export function getAdminToken(): string | null {
  return token;
}

/** fetch() wrapper that injects the admin token header. */
export function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-admin-token", token);
  return fetch(input, { ...init, headers });
}

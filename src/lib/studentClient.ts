"use client";

/**
 * Client-side student session token.
 *
 * After a successful access-code login, /api/student-auth returns a per-student
 * token. We keep it in a module-level variable (in memory — localStorage is
 * unreliable inside sandboxed iframes) and attach it as the `x-student-token`
 * header on every student API request via studentFetch().
 *
 * On a hard refresh the token is lost; the student app re-establishes it by
 * re-authing with the id in the URL (see ensureStudentToken in the student page).
 */

let token: string | null = null;

export function setStudentToken(t: string | null) {
  token = t;
}

export function getStudentToken(): string | null {
  return token;
}

/** fetch() wrapper that injects the student token header. */
export function studentFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("x-student-token", token);
  return fetch(input, { ...init, headers });
}

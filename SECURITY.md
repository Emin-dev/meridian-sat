# Security and deployment review

## Proposed safeguards

- API role and ownership checks for activity, student records, lessons, tools,
  media requests, and progress writes
- Explicit student response fields: access codes, teacher notes, staff labels,
  insights, recommendations, and future unknown columns are not returned
- Server-enforced published lessons and approved tools, with no student activation
  or teacher-field updates through the student record endpoint
- Randomized, purpose-bound, eight-hour signed sessions; access-code/password
  changes revoke corresponding existing sessions
- Durable database-backed login bounds (20 tutor attempts and 300 student attempts
  per deployment per 15 minutes), including failed and successful attempts
- Atomic daily AI quota consumption/bonus grants and one-time onboarding with a
  pending fallback request filed in the same database transaction
- Reviewed migration that enables RLS, revokes direct anon/authenticated table
  permissions, and restricts helper functions to the server service role
- KaTeX with untrusted content handling, patched renderer/PostCSS dependencies,
  and a maintained Next.js security release

These safeguards are source changes. They do not prove that any hosted service
uses this commit or that its database grants, policies, storage, or secrets match
this repository.

## Required review before rollout

1. Apply and test the migration in a separate Supabase project with synthetic
   records. Verify permissions using actual Supabase anon, authenticated, and
   service roles. The automated PGlite suite covers SQL behavior and grants, not
   the hosted PostgREST, Storage, proxy, or multi-connection production system.
2. Existing generated media uses a **public Supabase Storage bucket**. API row
   checks cannot make existing public object URLs private. Review data sensitivity,
   private-bucket migration, signed URLs, and external media providers before
   placing personal/student material in media generation. This patch does not
   change bucket settings, existing objects, URLs, or third-party accounts.
3. AI/media integrations can send student-specific context to external providers.
   Verify consent, provider terms, data minimization, and retention before using
   real records. Synthetic tests never call these providers.
4. Login throttling is deployment-wide. An attacker can exhaust the shared window;
   use a trusted hosting-layer rate limit for finer per-client protection without
   trusting arbitrary `X-Forwarded-For` values. Validate normal school login peaks.
5. Session expiry intentionally requires sign-in again after eight hours and
   rejects legacy static tokens. Logout clears the local/browser session; a
   previously copied bearer token remains valid until expiry or credential
   rotation. Per-session server-side revocation remains a future improvement.
6. Complete manual/browser QA of student sign-in, refresh/expiry, survey submission,
   tutor review, publication, progress, and media after staging setup. No live
   database or deployment is contacted by the build or tests.
7. The automatic draft-generation chain is quota-bound, but concurrent requests
   can still generate duplicate drafts. Engagement rollups also need concurrency
   hardening in a later change. Teacher request approval is transactional and
   revision-checked in this patch.

## Dependency audit, 7 October 2026

Next.js was upgraded from unsupported 14 to maintained 15.5.27. KaTeX is 0.18.2;
PostCSS is 8.5.29. Overrides keep transitive copies on those patched versions.
Vitest 5.0.3 is a new test dependency; Node.js 24 is used for verification.

`npm audit` still reports 9 affected packages (7 high, 2 moderate), stemming from
these two build/lint dependency advisories:

- [Braces stack-exhaustion denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
  Braces 3.0.3 remains the latest published version checked. It is pulled in by
  the Tailwind 3 and Next ESLint globbing chains.
- [PostCSS selector-parser CPU exhaustion](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).
  The retained Tailwind 3/PostCSS-nested toolchain depends on selector-parser 6;
  the patched line starts at 7.1.6.

Do not accept untrusted glob patterns or CSS for compilation/linting in a
network-accessible service. A Tailwind/toolchain upgrade requires a separately
verified style migration. This change preserves the existing framework/style
patterns rather than forcing incompatible audit fixes. CI reports advisories
without disguising them as a clean audit. No zero-vulnerability claim is made.

## Reporting

Do not put student records, access codes, credentials, backups, or private media
in public GitHub issues. Contact the repository owner privately with a minimal,
synthetic reproduction. No response-time or support-policy commitment is implied.

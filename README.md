# MeridianSAT

A tutor-managed SAT learning workspace built with Next.js, TypeScript, React,
Supabase PostgreSQL, and Tailwind CSS. Students receive personalized lessons and
practice; tutors review drafts, publish material, and track learning activity.

## What it does

- Student access-code sign-in and an onboarding survey
- Tutor-reviewed study plans, Markdown/KaTeX lessons, and practice questions
- Teacher-only lesson publication, student activation, and adaptive tool approval
- Student activity and progress views, with teacher-managed AI allowances
- Optional teacher-reviewed media requests and generation integrations

## Project status

This repository is undergoing security maintenance. The code includes synthetic
regression tests, but passing tests do not certify a live deployment. Review
[SECURITY.md](SECURITY.md) and apply the database migration in an isolated staging
project before considering a rollout. This change does not deploy the application,
change hosted database permissions, or inspect student records.

The stack is preserved: Next.js 15 maintenance LTS, React 18, TypeScript, Tailwind
CSS 3, and Supabase. Next 15.5.27 includes the [September 2026 security release](https://nextjs.org/blog/september-2026-security-release).

## Local development

Use Node.js 24 LTS and npm. Never use a production database for development or tests.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure an isolated Supabase project in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database credential; never expose in a browser |
| `ADMIN_PASSWORD` | Strong, unique tutor sign-in password |
| `STUDENT_TOKEN_SECRET` | Independent random session-signing secret, recommended |
| `DEEPSEEK_API_KEY` | Optional lesson personalization; onboarding retains a fallback if unavailable |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Optional media audio generation |
| `YOUTUBE_API_KEY` | Optional YouTube search integration |

Do not commit `.env.local` or credentials. Student sessions fall back to
`ADMIN_PASSWORD` as their signing secret if `STUDENT_TOKEN_SECRET` is absent.
Database access deliberately requires the server service-role key; an anonymous
public key is not an acceptable replacement.

### Database preparation

1. In the isolated project, review and run `supabase/schema.sql`.
2. Review and run `supabase/migrations/20261007_security_boundaries.sql`.
3. Add synthetic students through the tutor UI and exercise sign-in, onboarding,
   review, publication, and lesson completion.

The migration adds the missing tags/decorative-media schema, denies anonymous
and ordinary authenticated direct table access, and adds atomic quota, login,
and onboarding functions used by the server. Authentication fails closed if these
functions are missing. Application API routes perform role and ownership checks;
RLS is an additional database boundary, not a substitute for those checks.

No hosted migration is performed by tests, CI, `npm run build`, or this README.
Existing databases and storage settings need a separate reviewed rollout.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:smoke
# Or run lint, all tests, and the production build together:
npm run check
npm audit
```

Tests use fabricated fixtures and a disposable in-memory PostgreSQL-compatible
PGlite database. They cover sessions, credential rotation, role/owner/publication
boundaries, quota updates, login limits, RLS/grants, idempotent onboarding, and
delayed generation without overwriting tutor edits. The HTTP smoke check starts
the production server on loopback and verifies anonymous API rejection.
They do not use live Supabase credentials or AI providers. Remaining dependency advisories and deployment review limits are documented
in `SECURITY.md`.

## Teaching workflow

1. The tutor creates a student and shares a unique access code privately.
2. The student submits the survey. A single pending review request is filed
   atomically, with a usable fallback if personalization cannot run.
3. The tutor reviews the request and publishes suitable material.
4. Students can access their own published lessons and approved tools. They
   cannot activate themselves or retrieve teacher notes or access codes.
5. Changing an access code revokes that student's existing sessions. Changing
   the tutor password revokes existing tutor sessions.

## Structure

- `src/app/api/`: server routes, authorization, and workflow operations
- `src/app/student/`, `src/app/admin/`: student and tutor interfaces
- `src/components/`: reusable interface, lesson, review, and media components
- `src/lib/`: session, database, AI, tracking, and response helpers
- `supabase/`: base schema and reviewed migration proposals
- `tests/`: isolated synthetic regression tests
- `.github/workflows/ci.yml`: source checks and production build, no deployment

## Contributing

Keep changes focused and preserve the existing TypeScript/React patterns. Add
regression tests for security boundaries, use synthetic records, and include
verification results and remaining limits in pull requests. Do not include
student data, access codes, backups, credentials, or generated private media in
issues, fixtures, logs, screenshots, or commits.

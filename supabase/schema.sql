-- ============================================================
--  MeridianSAT — Supabase database schema
--  Run this in your Supabase project: SQL Editor -> New query -> Run
-- ============================================================

-- Students: each student logs in with a simple access code
create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  access_code text not null unique,
  grade       text,                       -- e.g. "11th grade"
  target_score integer default 1400,
  weak_areas  text[] default '{}',        -- e.g. {"Algebra","Reading Comprehension"}
  notes       text default '',            -- admin private notes
  created_at  timestamptz default now()
);

-- Student onboarding + lesson-approval workflow + engagement columns.
-- status: 'new' (just created) | 'preparing' (locked, awaiting tutor approval) | 'active'
alter table students add column if not exists onboarded          boolean default false;
alter table students add column if not exists survey             jsonb default '{}'::jsonb;
alter table students add column if not exists status             text default 'new';
alter table students add column if not exists study_plan         text default '';
alter table students add column if not exists ai_summary         text default '';
alter table students add column if not exists labels             text[] default '{}';
alter table students add column if not exists insights           jsonb default '{}'::jsonb;
alter table students add column if not exists recommendations    jsonb default '[]'::jsonb;
alter table students add column if not exists total_study_seconds integer default 0;
alter table students add column if not exists last_active_at      timestamptz;
alter table students add column if not exists streak_days         integer default 0;
alter table students add column if not exists engagement_score    integer default 0;

-- Lessons: AI-generated, fully editable by admin
create table if not exists lessons (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  title       text not null,
  section     text not null,              -- "Math" | "Reading and Writing"
  topic       text not null,              -- e.g. "Linear equations"
  difficulty  text default 'medium',      -- easy | medium | hard
  content     text not null default '',   -- markdown: concept explanation
  questions   jsonb default '[]'::jsonb,  -- [{prompt, choices, answer, explanation}]
  study_plan  text default '',            -- markdown study plan (optional)
  status      text default 'published',   -- draft | published
  created_at  timestamptz default now()
);

-- Progress: per lesson, per student
create table if not exists progress (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  lesson_id   uuid references lessons(id) on delete cascade,
  completed   boolean default false,
  score       integer,                    -- % correct on the lesson's questions
  total_q     integer default 0,
  correct_q   integer default 0,
  updated_at  timestamptz default now()
);

-- Prompts: admin-editable AI instruction templates
create table if not exists prompts (
  id          text primary key,           -- e.g. "lesson_system"
  label       text not null,
  content     text not null,
  updated_at  timestamptz default now()
);

-- Settings: simple key/value for global app config
create table if not exists settings (
  key   text primary key,
  value text not null
);

-- Events: granular per-student activity log (time on lessons/practice/reading, etc.)
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  lesson_id   uuid references lessons(id) on delete set null,
  type        text not null,              -- login | lesson_open | reading_tick | practice_time | practice_answer | exam_submit | plan_time ...
  meta        jsonb default '{}'::jsonb,
  duration_ms integer default 0,
  created_at  timestamptz default now()
);
create index if not exists events_student_idx on events (student_id);
create index if not exists events_type_idx    on events (type);
create index if not exists events_created_idx  on events (created_at);

-- Lesson requests: the approval queue. A student's first plan + lessons are filed
-- here as a PENDING draft for the tutor to approve, refine, or send back.
create table if not exists lesson_requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  status      text not null default 'pending',  -- pending | approved | denied
  study_plan  text default '',
  ai_summary  text default '',
  lessons     jsonb default '[]'::jsonb,         -- array of draft lessons
  notes       text default '',
  version     integer default 1,
  feedback    text default '',
  discussion  jsonb default '[]'::jsonb,         -- tutor <-> assistant refine chat
  created_at  timestamptz default now(),
  reviewed_at timestamptz
);
create index if not exists lesson_requests_student_idx on lesson_requests (student_id);
create index if not exists lesson_requests_status_idx  on lesson_requests (status);
create index if not exists lesson_requests_created_idx  on lesson_requests (created_at);

-- ---------- Per-student adaptive tools ----------
-- Proposed extra tools / pages / sub-features for an individual student, based
-- on how they actually use the app (e.g. exam-pacing drills for someone who
-- spends too long on exams, vocab flashcards for a reading struggler). Every
-- proposal is gated behind teacher approval before the student ever sees it.
create table if not exists student_tools (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references students(id) on delete cascade,
  status      text not null default 'pending',  -- pending | approved | denied
  kind        text not null default 'tool',     -- tool | page | drill | practice
  key         text not null,                    -- stable slug, unique per student
  title       text not null,
  description text default '',                   -- short student-facing blurb
  icon        text default 'sparkles',           -- lucide icon name
  config      jsonb default '{}'::jsonb,         -- tool-specific settings
  rationale   text default '',                   -- why the system proposed this (admin-only)
  source      text default 'auto',               -- auto | manual
  created_at  timestamptz default now(),
  reviewed_at timestamptz
);
create unique index if not exists student_tools_student_key_idx on student_tools (student_id, key);
create index if not exists student_tools_student_idx on student_tools (student_id);
create index if not exists student_tools_status_idx  on student_tools (status);

-- ---------- Per-student daily AI usage / rate limiting ----------
-- One row per (student, UTC day). The school runs an unlimited DeepSeek plan, so
-- this exists for fairness + abuse protection, not cost control. The app applies
-- a tiered ramp in src/lib/ratelimit.ts: warn at 90, throttle at 100 (spaced 4
-- min apart), hard block at 200 until a teacher grants more or 12h pass. Admins
-- raise every threshold for a student/day by adding to `bonus`.
create table if not exists ai_usage (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid references students(id) on delete cascade,
  day             date not null,                 -- UTC date the counter belongs to
  count           integer not null default 0,    -- AI requests used so far this day
  bonus           integer not null default 0,    -- admin-granted extra allowance
  last_request_at timestamptz,                    -- powers throttle spacing
  blocked_until   timestamptz,                    -- set when hard ceiling is hit
  created_at      timestamptz default now()
);
create unique index if not exists ai_usage_student_day_idx on ai_usage (student_id, day);
create index if not exists ai_usage_student_idx on ai_usage (student_id);

-- ---------- Rich media assets (NotebookLM-style studio) ----------
-- Images/diagrams, podcast audio overviews, narrated video overviews, and
-- curated YouTube picks generated per student (optionally attached to a lesson).
-- Files for generated kinds live in the public Supabase Storage 'media' bucket;
-- `url` points at the public object (or the YouTube watch URL for curated picks).
create table if not exists media_assets (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references students(id) on delete cascade,
  lesson_id     uuid references lessons(id) on delete set null,
  kind          text not null,                   -- image | podcast | video | youtube
  title         text default '',
  prompt        text default '',                 -- the prompt/topic that produced it
  url           text default '',                 -- public asset URL (or YouTube URL)
  thumbnail_url text default '',
  meta          jsonb default '{}'::jsonb,        -- kind-specific extras (slides[], script, duration…)
  status        text not null default 'ready',   -- ready | generating | error
  created_at    timestamptz default now()
);
create index if not exists media_assets_student_idx on media_assets (student_id);
create index if not exists media_assets_lesson_idx  on media_assets (lesson_id);

-- ---------- Seed default AI prompts (admin can edit these in the UI) ----------
insert into prompts (id, label, content) values
(
  'lesson_system',
  'Lesson generation — system instructions',
  'You are an expert SAT tutor. You create clear, encouraging, personalized SAT lessons for one student at a time. You always follow the official Digital SAT structure: two sections (Reading and Writing, and Math), scored 200-800 each, 400-1600 total. Use precise, accurate content. For math, use KaTeX-compatible LaTeX wrapped in \\( ... \\) for inline and \\[ ... \\] for display. Be concise but thorough. Always return valid JSON only.'
),
(
  'lesson_user',
  'Lesson generation — task template',
  'Create a personalized SAT lesson.

Student: {{student_name}} (grade: {{grade}}, target score: {{target_score}}).
Known weak areas: {{weak_areas}}.

Section: {{section}}
Topic: {{topic}}
Difficulty: {{difficulty}}

Return STRICT JSON with this exact shape:
{
  "title": "short lesson title",
  "content": "markdown concept explanation (200-400 words, clear and encouraging)",
  "questions": [
    {
      "prompt": "question text",
      "choices": ["A ...", "B ...", "C ...", "D ..."],
      "answer": "A",
      "explanation": "why this is correct, step by step"
    }
  ],
  "study_plan": "a short markdown study plan tailored to this student"
}

Include 4 to 6 SAT-style practice questions. Make them realistic and aligned to the official Digital SAT.'
)
on conflict (id) do nothing;

insert into settings (key, value) values
  ('app_name', 'MeridianSAT'),
  ('welcome_message', 'Welcome back! Your personalized SAT lessons are ready.')
on conflict (key) do nothing;

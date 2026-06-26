-- ============================================================
--  SAT Tutor — Supabase database schema
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
  ('app_name', 'SAT Tutor'),
  ('welcome_message', 'Welcome back! Your personalized SAT lessons are ready.')
on conflict (key) do nothing;

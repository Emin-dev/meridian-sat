import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client.
// IMPORTANT: only import this from server code (API routes), never the browser.
// All access goes through the app's API routes, which are protected by the admin
// password and per-student access codes. Row Level Security is enabled on the
// database with policies scoped to this key.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabaseAdmin() {
  if (!url || !apiKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
  }
  return createClient(url, apiKey, {
    auth: { persistSession: false },
  });
}

export type Student = {
  id: string;
  name: string;
  access_code: string;
  grade: string | null;
  target_score: number;
  weak_areas: string[];
  notes: string;
  onboarded: boolean;
  survey: Record<string, any>;
  study_plan: string;
  ai_summary: string;
  created_at: string;
};

export type Question = {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
};

export type Lesson = {
  id: string;
  student_id: string;
  title: string;
  section: string;
  topic: string;
  difficulty: string;
  content: string;
  questions: Question[];
  study_plan: string;
  status: string;
  created_at: string;
};

export type Progress = {
  id: string;
  student_id: string;
  lesson_id: string;
  completed: boolean;
  score: number | null;
  total_q: number;
  correct_q: number;
  updated_at: string;
};

export type Prompt = {
  id: string;
  label: string;
  content: string;
  updated_at: string;
};

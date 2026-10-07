import { createClient } from "@supabase/supabase-js";

// Server-side client. RLS is defense in depth; API guards enforce application roles.
// Only a server service-role key is accepted. An anon-key fallback could conceal
// incomplete deployment configuration or encourage public table access.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !apiKey) throw new Error("Server Supabase configuration is missing.");
  return createClient(url, apiKey, { auth: { persistSession: false } });
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
  // Lifecycle: 'new' | 'preparing' (locked, teacher building lessons) | 'active'
  status: string;
  survey: Record<string, any>;
  study_plan: string;
  ai_summary: string;
  created_at: string;
  // Engagement & insight fields (maintained from the activity log)
  labels: string[];
  // Teacher-assigned cohort tags (e.g. "Spring Cohort"). Free-form, multi.
  tags: string[];
  insights: Record<string, any>;
  recommendations: Record<string, any>;
  total_study_seconds: number;
  last_active_at: string | null;
  streak_days: number;
  engagement_score: number;
};

// A draft lesson package awaiting teacher review before it reaches the student.
export type LessonRequest = {
  id: string;
  student_id: string;
  status: string; // 'pending' | 'approved' | 'denied'
  study_plan: string;
  ai_summary: string;
  lessons: Omit<Lesson, "id" | "student_id" | "status" | "created_at">[];
  notes: string;
  version: number;
  feedback: string;
  discussion: { role: "teacher" | "assistant"; content: string }[];
  created_at: string;
  reviewed_at: string | null;
};

// A per-student adaptive tool / page proposed by the helper, gated behind
// teacher approval before the student can see it.
export type StudentTool = {
  id: string;
  student_id: string;
  status: string; // 'pending' | 'approved' | 'denied'
  kind: string;   // 'tool' | 'page' | 'drill' | 'practice'
  key: string;
  title: string;
  description: string;
  icon: string;
  config: Record<string, any>;
  rationale: string;
  source: string; // 'auto' | 'manual'
  created_at: string;
  reviewed_at: string | null;
};

// A single logged activity event for a student.
export type ActivityEvent = {
  id: string;
  student_id: string;
  lesson_id: string | null;
  type: string;
  meta: Record<string, any>;
  duration_ms: number;
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

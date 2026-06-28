"use client";

import { useState } from "react";
import { Logo, Button } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import { studentFetch } from "@/lib/studentClient";
import LoopVideo from "@/components/LoopVideo";
import { Sparkles, ChevronRight, ChevronLeft } from "lucide-react";

// Unskippable first-login survey. The student MUST answer these before they can
// reach the dashboard. Their answers are sent to /api/onboarding, which moves
// the student into the locked "preparing" state while their personalized lessons
// are built and reviewed by their tutor.

type Answers = {
  goal: string;
  timeline: string;
  confidence: string;
  strengths: string;
  weaknesses: string;
  hours: string;
};

type Step = {
  key: keyof Answers;
  title: string;
  subtitle: string;
  // Either a list of options (single-select) or free text.
  options?: string[];
  placeholder?: string;
  multiline?: boolean;
};

const STEPS: Step[] = [
  {
    key: "goal",
    title: "What's your main goal?",
    subtitle: "This helps us aim your lessons at the right outcome.",
    options: [
      "Reach a specific score",
      "Get into a dream college",
      "Improve from my last attempt",
      "Just starting out",
    ],
  },
  {
    key: "timeline",
    title: "When is your SAT?",
    subtitle: "We'll pace your study plan to fit your timeline.",
    options: [
      "Within 1 month",
      "1–3 months",
      "3–6 months",
      "More than 6 months / not sure yet",
    ],
  },
  {
    key: "confidence",
    title: "How confident do you feel right now?",
    subtitle: "Be honest — there are no wrong answers.",
    options: [
      "Not confident yet",
      "A little confident",
      "Fairly confident",
      "Very confident",
    ],
  },
  {
    key: "strengths",
    title: "What are you good at?",
    subtitle: "Tell us the subjects or topics that feel easy for you.",
    placeholder: "e.g. algebra, reading comprehension, grammar…",
    multiline: true,
  },
  {
    key: "weaknesses",
    title: "What do you struggle with most?",
    subtitle: "We'll focus your lessons here first.",
    placeholder: "e.g. geometry, vocabulary in context, time management…",
    multiline: true,
  },
  {
    key: "hours",
    title: "How many hours can you study per week?",
    subtitle: "Pick what's realistic — consistency beats cramming.",
    options: ["1–2 hours", "3–5 hours", "6–10 hours", "More than 10 hours"],
  },
];

export default function Onboarding({
  student,
  onDone,
}: {
  student: Student;
  onDone: (updated: Student) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    goal: "",
    timeline: "",
    confidence: "",
    strengths: "",
    weaknesses: "",
    hours: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const current = STEPS[step];
  const value = answers[current.key];
  const isLast = step === STEPS.length - 1;
  const canContinue = value.trim().length > 0;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  function set(v: string) {
    setAnswers((a) => ({ ...a, [current.key]: v }));
  }

  async function next() {
    if (!canContinue) return;
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    // Final step → build profile with AI.
    setSubmitting(true);
    setError("");
    try {
      const res = await studentFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      onDone(data.student);
    } catch (e: any) {
      setError(e.message || "Could not finish setup. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center overflow-hidden px-5">
        <div className="flex flex-col items-center text-center animate-fadeUp">
          {/* Wordless "working" loop — the universal cue that the app is busy. */}
          <LoopVideo
            src="/loading.mp4"
            poster="/loading-poster.jpg"
            label="Sending your answers"
            size="w-32"
          />
          <h1 className="mt-4 font-display text-xl font-extrabold text-ink">
            Sending to your tutor{".".repeat(3)}
          </h1>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            Saving your answers so your tutor can build lessons just for you.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="text-xs font-semibold text-ink-muted">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      {/* progress bar */}
      <div className="h-1 w-full bg-slate-100">
        <div
          className="h-1 bg-brand-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-7 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" />
          <span className="text-xs font-bold uppercase tracking-wide text-brand-600">
            Welcome, {student.name?.split(" ")[0]}
          </span>
        </div>

        <div key={current.key} className="animate-fadeUp">
          <h1 className="font-display text-2xl font-extrabold text-ink">
            {current.title}
          </h1>
          <p className="mt-2 text-sm text-ink-soft">{current.subtitle}</p>

          <div className="mt-6">
            {current.options ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {current.options.map((opt) => {
                  const selected = value === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => set(opt)}
                      className={`rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 text-brand-700 shadow-card"
                          : "border-line bg-white text-ink-soft hover:border-brand-300"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={current.placeholder}
                rows={4}
                autoFocus
                className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink outline-none transition focus:border-brand-400"
              />
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-7 flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-0"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <Button onClick={next} disabled={!canContinue}>
              {isLast ? "Finish & send to my tutor" : "Continue"}
              {isLast ? <Sparkles size={16} /> : <ChevronRight size={16} />}
            </Button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-ink-muted">
          Your answers help your tutor personalize your lessons.
        </p>
      </div>
    </main>
  );
}

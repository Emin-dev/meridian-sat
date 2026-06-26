"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Logo, Button, Card, Badge, Spinner } from "@/components/ui";
import Markdown from "@/components/Markdown";
import Onboarding from "@/components/Onboarding";
import type { Lesson, Student, Progress } from "@/lib/supabase";
import {
  BookOpen,
  Target,
  CheckCircle2,
  ChevronLeft,
  ListChecks,
  GraduationCap,
  LogOut,
  Sparkles,
  CalendarCheck,
} from "lucide-react";

function StudentInner() {
  const params = useSearchParams();
  const router = useRouter();
  const studentId = params.get("id") || "";

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [active, setActive] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlan, setShowPlan] = useState(false);

  async function load() {
    if (!studentId) {
      router.push("/");
      return;
    }
    setLoading(true);
    const [sRes, lRes, pRes] = await Promise.all([
      fetch("/api/students").then((r) => r.json()),
      fetch(`/api/lessons?studentId=${studentId}`).then((r) => r.json()),
      fetch(`/api/progress?studentId=${studentId}`).then((r) => r.json()),
    ]);
    const me = (sRes.students || []).find((s: Student) => s.id === studentId);
    if (!me) {
      router.push("/");
      return;
    }
    setStudent(me);
    setLessons((lRes.lessons || []).filter((l: Lesson) => l.status === "published"));
    setProgress(pRes.progress || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const progFor = (id: string) => progress.find((p) => p.lesson_id === id);
  const completedCount = progress.filter((p) => p.completed).length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-brand-600">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  // Unskippable first-login survey: if the student hasn't onboarded, they must
  // complete it before seeing anything else.
  if (student && !student.onboarded) {
    return (
      <Onboarding
        student={student}
        onDone={(updated) => {
          setStudent(updated);
          load();
        }}
      />
    );
  }

  if (active) {
    return (
      <LessonView
        lesson={active}
        studentId={studentId}
        existing={progFor(active.id)}
        onBack={() => {
          setActive(null);
          load();
        }}
      />
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* greeting + stats */}
        <div className="animate-fadeUp">
          <h1 className="font-display text-2xl font-extrabold text-ink">
            Hi {student?.name?.split(" ")[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Here are your personalized lessons. Keep going — every question counts.
          </p>
        </div>

        {/* AI-generated welcome summary */}
        {student?.ai_summary && (
          <Card className="mt-5 flex items-start gap-3 border-brand-100 bg-brand-50/60 p-4 animate-fadeUp">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <Sparkles size={16} />
            </div>
            <p className="text-sm text-ink-soft">{student.ai_summary}</p>
          </Card>
        )}

        {/* AI study plan (collapsible) */}
        {student?.study_plan && (
          <Card className="mt-3 p-4 animate-fadeUp">
            <button
              onClick={() => setShowPlan((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="inline-flex items-center gap-2 font-semibold text-ink">
                <CalendarCheck size={17} className="text-brand-600" />
                Your personalized study plan
              </span>
              <span className="text-sm font-semibold text-brand-600">
                {showPlan ? "Hide" : "View"}
              </span>
            </button>
            {showPlan && (
              <div className="mt-4 border-t border-line pt-4">
                <Markdown>{student.study_plan}</Markdown>
              </div>
            )}
          </Card>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat icon={<BookOpen size={18} />} value={lessons.length} label="Lessons" />
          <Stat
            icon={<CheckCircle2 size={18} />}
            value={completedCount}
            label="Completed"
            tone="green"
          />
          <Stat
            icon={<Target size={18} />}
            value={student?.target_score ?? "—"}
            label="Target score"
            tone="brand"
          />
        </div>

        {/* lessons */}
        <h2 className="mt-9 text-sm font-bold uppercase tracking-wide text-ink-muted">
          Your lessons
        </h2>

        {lessons.length === 0 ? (
          <Card className="mt-3 p-10 text-center">
            <GraduationCap className="mx-auto text-brand-300" size={40} />
            <p className="mt-3 font-semibold text-ink">No lessons yet</p>
            <p className="mt-1 text-sm text-ink-muted">
              Your tutor will add personalized lessons here soon.
            </p>
          </Card>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => {
              const p = progFor(l.id);
              return (
                <Card
                  key={l.id}
                  className="cursor-pointer p-5 transition hover:-translate-y-0.5 hover:shadow-pop"
                >
                  <button
                    onClick={() => setActive(l)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={l.section === "Math" ? "brand" : "amber"}>
                        {l.section}
                      </Badge>
                      <Badge tone="slate">{l.difficulty}</Badge>
                      {p?.completed && (
                        <Badge tone="green">
                          {p.score != null ? `${p.score}%` : "Done"}
                        </Badge>
                      )}
                    </div>
                    <h3 className="mt-3 font-bold text-ink">{l.title}</h3>
                    <p className="mt-1 text-sm text-ink-muted">{l.topic}</p>
                    <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                      <ListChecks size={15} />
                      {l.questions?.length || 0} practice questions
                    </p>
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function Stat({
  icon,
  value,
  label,
  tone = "slate",
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: "slate" | "green" | "brand";
}) {
  const tones: Record<string, string> = {
    slate: "text-ink-soft bg-slate-100",
    green: "text-green-700 bg-green-50",
    brand: "text-brand-700 bg-brand-50",
  };
  return (
    <Card className="p-4">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
    </Card>
  );
}

// ---------------- Lesson view with practice ----------------
function LessonView({
  lesson,
  studentId,
  existing,
  onBack,
}: {
  lesson: Lesson;
  studentId: string;
  existing?: Progress;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"lesson" | "practice" | "plan">("lesson");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const questions = lesson.questions || [];

  function letter(choice: string) {
    return choice.trim().charAt(0).toUpperCase();
  }

  const correctCount = questions.filter(
    (q, i) => answers[i] && answers[i] === q.answer.trim().charAt(0).toUpperCase()
  ).length;
  const score =
    questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

  async function submit() {
    setSubmitted(true);
    setSaving(true);
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        lesson_id: lesson.id,
        completed: true,
        score,
        total_q: questions.length,
        correct_q: correctCount,
      }),
    });
    setSaving(false);
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <ChevronLeft size={18} /> Back
          </button>
          <Logo />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={lesson.section === "Math" ? "brand" : "amber"}>
            {lesson.section}
          </Badge>
          <Badge tone="slate">{lesson.difficulty}</Badge>
        </div>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-ink">
          {lesson.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{lesson.topic}</p>

        {/* tabs */}
        <div className="mt-6 flex gap-1 rounded-xl border border-line bg-white p-1">
          <TabBtn active={tab === "lesson"} onClick={() => setTab("lesson")}>
            Lesson
          </TabBtn>
          <TabBtn active={tab === "practice"} onClick={() => setTab("practice")}>
            Practice ({questions.length})
          </TabBtn>
          {lesson.study_plan && (
            <TabBtn active={tab === "plan"} onClick={() => setTab("plan")}>
              Study plan
            </TabBtn>
          )}
        </div>

        {tab === "lesson" && (
          <Card className="mt-4 p-6 animate-fadeUp">
            <Markdown>{lesson.content}</Markdown>
            <div className="mt-6 border-t border-line pt-5">
              <Button onClick={() => setTab("practice")}>
                Start practice <ListChecks size={16} />
              </Button>
            </div>
          </Card>
        )}

        {tab === "plan" && (
          <Card className="mt-4 p-6 animate-fadeUp">
            <Markdown>{lesson.study_plan}</Markdown>
          </Card>
        )}

        {tab === "practice" && (
          <div className="mt-4 space-y-4 animate-fadeUp">
            {questions.length === 0 && (
              <Card className="p-8 text-center text-ink-muted">
                No practice questions for this lesson.
              </Card>
            )}
            {questions.map((q, i) => {
              const picked = answers[i];
              const correct = q.answer.trim().charAt(0).toUpperCase();
              return (
                <Card key={i} className="p-5">
                  <p className="font-semibold text-ink">
                    <span className="text-brand-600">Q{i + 1}.</span>{" "}
                    <span className="inline">
                      <Markdown>{q.prompt}</Markdown>
                    </span>
                  </p>
                  <div className="mt-3 space-y-2">
                    {q.choices?.map((c, ci) => {
                      const L = letter(c);
                      const isPicked = picked === L;
                      let cls =
                        "border-line bg-white hover:border-brand-300";
                      if (submitted) {
                        if (L === correct)
                          cls = "border-green-400 bg-green-50";
                        else if (isPicked)
                          cls = "border-red-300 bg-red-50";
                      } else if (isPicked) {
                        cls = "border-brand-400 bg-brand-50";
                      }
                      return (
                        <button
                          key={ci}
                          disabled={submitted}
                          onClick={() =>
                            setAnswers((a) => ({ ...a, [i]: L }))
                          }
                          className={`flex w-full items-start gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm text-ink-soft transition ${cls}`}
                        >
                          <span className="font-bold text-ink">{L}</span>
                          <span>{c.replace(/^[A-D][).\s]*/, "")}</span>
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                      <p className="font-semibold text-ink">
                        {picked === correct ? "✅ Correct" : `❌ Correct answer: ${correct}`}
                      </p>
                      <div className="mt-1 text-ink-soft">
                        <Markdown>{q.explanation}</Markdown>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}

            {questions.length > 0 && !submitted && (
              <Button
                onClick={submit}
                disabled={Object.keys(answers).length < questions.length}
                className="w-full"
              >
                Submit answers
              </Button>
            )}

            {submitted && (
              <Card className="p-6 text-center">
                <p className="text-sm font-medium text-ink-muted">Your score</p>
                <p className="mt-1 text-4xl font-extrabold text-brand-600">
                  {score}%
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {correctCount} of {questions.length} correct
                  {saving && " · saving…"}
                </p>
                <div className="mt-4">
                  <Button variant="ghost" onClick={onBack}>
                    Back to lessons
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

export default function StudentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-brand-600">
          <Spinner className="h-7 w-7" />
        </div>
      }
    >
      <StudentInner />
    </Suspense>
  );
}

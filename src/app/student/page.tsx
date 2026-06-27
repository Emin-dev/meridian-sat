"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Logo, Button, Card, Badge, Spinner } from "@/components/ui";
import Markdown from "@/components/Markdown";
import Onboarding from "@/components/Onboarding";
import Preparing from "@/components/Preparing";
import { createTracker, type Tracker } from "@/lib/track";
import UsageMeter, { type RateStatus } from "@/components/UsageMeter";
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
  ArrowRight,
  Timer,
  Calculator,
  Flame,
  RotateCcw,
  Heart,
  Trophy,
  Glasses,
  AlertTriangle,
  Clock,
  Ban,
  type LucideIcon,
} from "lucide-react";

// Icon slugs (from the tool catalog) -> lucide components.
const TOOL_ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  "book-open": BookOpen,
  calculator: Calculator,
  flame: Flame,
  "rotate-ccw": RotateCcw,
  heart: Heart,
  trophy: Trophy,
  glasses: Glasses,
  sparkles: Sparkles,
};

type StudentToolCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  kind: string;
};

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
  const [nudge, setNudge] = useState<{ message: string; lessonId: string | null; mood: string } | null>(null);
  const nudgeFetched = useRef(false);
  const [tools, setTools] = useState<StudentToolCard[]>([]);
  // When an AI request is warned/throttled/blocked, the API returns the rate
  // status. We surface a gentle, student-friendly notice from it.
  const [rateNotice, setRateNotice] = useState<RateStatus | null>(null);

  // Invisible activity tracker — one per student session.
  const tracker = useMemo<Tracker | null>(
    () => (studentId ? createTracker(studentId) : null),
    [studentId]
  );
  const loggedLogin = useRef(false);
  useEffect(() => {
    return () => tracker?.dispose();
  }, [tracker]);

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

    // Log a login event once the active student is loaded.
    if (me.status === "active" && !loggedLogin.current) {
      loggedLogin.current = true;
      tracker?.track("login", { meta: { name: me.name } });
    }

    // Quietly fetch a personalized "what to do next" nudge once per session.
    // Uses the adaptive helper, which motivates differently depending on whether
    // the student is thriving or struggling.
    if (me.status === "active" && !nudgeFetched.current) {
      nudgeFetched.current = true;
      fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "student", studentId }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => null);
          // 429 (or any payload carrying a rate status) → surface the notice.
          if (d?.rate) setRateNotice(d.rate);
          return r.ok ? d : null;
        })
        .then((d) => {
          const a = d?.actions?.[0];
          if (a)
            setNudge({
              message: a.why ? `${a.label} — ${a.why}` : a.label,
              lessonId: a.target?.lessonId ?? null,
              mood: d.mood || "steady",
            });
        })
        .catch(() => {});
    }

    // Load any tools the teacher has approved for this student.
    if (me.status === "active") {
      fetch(`/api/student-tools?studentId=${studentId}&status=approved`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.tools) setTools(d.tools);
        })
        .catch(() => {});
    }
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

  // Locked waiting state: survey done, but the teacher hasn't approved the
  // personalized lessons yet. The student can do nothing but wait; this screen
  // auto-unlocks when status flips to "active".
  if (student && student.status === "preparing") {
    return (
      <Preparing
        student={student}
        onReady={(updated) => {
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
        tracker={tracker}
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
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <UsageMeter studentId={studentId} compact />
            </div>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
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

        {/* Daily AI request notice — only appears when the student is nearing,
            throttled by, or has hit their daily limit. Stays invisible otherwise
            so the normal experience is clean. */}
        {rateNotice && rateNotice.tier !== "ok" && rateNotice.message && (
          <Card
            className={`mt-5 flex items-start gap-3 p-4 animate-fadeUp ${
              rateNotice.tier === "block"
                ? "border-red-200 bg-red-50/70"
                : rateNotice.tier === "throttle"
                ? "border-orange-200 bg-orange-50/70"
                : "border-amber-200 bg-amber-50/70"
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                rateNotice.tier === "block"
                  ? "bg-red-100 text-red-600"
                  : rateNotice.tier === "throttle"
                  ? "bg-orange-100 text-orange-600"
                  : "bg-amber-100 text-amber-600"
              }`}
            >
              {rateNotice.tier === "block" ? (
                <Ban size={16} />
              ) : rateNotice.tier === "throttle" ? (
                <Clock size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
            </div>
            <div className="min-w-0">
              <p
                className={`text-sm font-medium ${
                  rateNotice.tier === "block"
                    ? "text-red-700"
                    : rateNotice.tier === "throttle"
                    ? "text-orange-700"
                    : "text-amber-700"
                }`}
              >
                {rateNotice.message}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Your lessons and practice are always available — this only affects
                instant help. {rateNotice.count}/{rateNotice.limit} used today.
              </p>
            </div>
          </Card>
        )}

        {/* Personalized next-step nudge (quiet, dismissible by acting on it) */}
        {nudge && (
          <button
            onClick={() => {
              const target = nudge.lessonId
                ? lessons.find((l) => l.id === nudge.lessonId)
                : null;
              if (target) {
                tracker?.track("lesson_open", {
                  lessonId: target.id,
                  meta: { title: target.title, section: target.section, via: "suggestion" },
                });
                setActive(target);
              }
            }}
            className={`mt-5 flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition hover:shadow-pop animate-fadeUp ${
              nudge.mood === "thriving"
                ? "border-green-200 bg-gradient-to-r from-green-50 to-white hover:border-green-300"
                : nudge.mood === "struggling"
                ? "border-amber-200 bg-gradient-to-r from-amber-50 to-white hover:border-amber-300"
                : "border-brand-200 bg-gradient-to-r from-brand-50 to-white hover:border-brand-300"
            }`}
          >
            <span className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${
                  nudge.mood === "thriving"
                    ? "bg-green-600"
                    : nudge.mood === "struggling"
                    ? "bg-amber-500"
                    : "bg-brand-600"
                }`}
              >
                {nudge.mood === "thriving" ? (
                  <Trophy size={16} />
                ) : nudge.mood === "struggling" ? (
                  <Heart size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
              </span>
              <span className="text-sm font-medium text-ink">{nudge.message}</span>
            </span>
            {nudge.lessonId && (
              <ArrowRight
                size={18}
                className={`shrink-0 ${
                  nudge.mood === "thriving"
                    ? "text-green-600"
                    : nudge.mood === "struggling"
                    ? "text-amber-600"
                    : "text-brand-600"
                }`}
              />
            )}
          </button>
        )}

        {/* Personalized welcome summary */}
        {student?.ai_summary && (
          <Card className="mt-5 flex items-start gap-3 border-brand-100 bg-brand-50/60 p-4 animate-fadeUp">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
              <Sparkles size={16} />
            </div>
            <p className="text-sm text-ink-soft">{student.ai_summary}</p>
          </Card>
        )}

        {/* Personalized study plan (collapsible) */}
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

        {/* Personalized tools the tutor has unlocked for this student */}
        {tools.length > 0 && (
          <>
            <h2 className="mt-9 text-sm font-bold uppercase tracking-wide text-ink-muted">
              For you
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => {
                const Icon = TOOL_ICONS[t.icon] || Sparkles;
                return (
                  <Card
                    key={t.id}
                    className="flex items-start gap-3 border-brand-100 bg-brand-50/40 p-4 animate-fadeUp"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{t.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

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
                    onClick={() => {
                      tracker?.track("lesson_open", {
                        lessonId: l.id,
                        meta: { title: l.title, section: l.section },
                      });
                      setActive(l);
                    }}
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
  tracker,
  existing,
  onBack,
}: {
  lesson: Lesson;
  studentId: string;
  tracker: Tracker | null;
  existing?: Progress;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"lesson" | "practice" | "plan">("lesson");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const questions = lesson.questions || [];

  // Time-on-task: measure how long the student spends on each tab (reading the
  // lesson, doing practice, viewing the plan). A timer restarts whenever the
  // active tab changes and reports elapsed time for the previous tab.
  const stopTimerRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!tracker) return;
    const type =
      tab === "lesson"
        ? "reading_tick"
        : tab === "practice"
          ? "practice_time"
          : "plan_time";
    const stop = tracker.startTimer(type, {
      lessonId: lesson.id,
      meta: { tab, title: lesson.title },
    });
    stopTimerRef.current = stop;
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lesson.id]);

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
    // Log each answer (correct/incorrect) and the final submission.
    questions.forEach((q, i) => {
      const correct = q.answer.trim().charAt(0).toUpperCase();
      tracker?.track("practice_answer", {
        lessonId: lesson.id,
        meta: { q: i + 1, correct: answers[i] === correct },
      });
    });
    tracker?.track("exam_submit", {
      lessonId: lesson.id,
      meta: { score, correctCount, total: questions.length },
    });
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

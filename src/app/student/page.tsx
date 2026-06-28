"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Logo, Button, Card, Badge } from "@/components/ui";
import Markdown from "@/components/Markdown";
import Onboarding from "@/components/Onboarding";
import Preparing from "@/components/Preparing";
import { createTracker, type Tracker } from "@/lib/track";
import UsageMeter, { type RateStatus } from "@/components/UsageMeter";
import type { Lesson, Student, Progress } from "@/lib/supabase";
import { studentFetch, setStudentToken, getStudentToken } from "@/lib/studentClient";
import StudentMedia from "@/components/StudentMedia";
import LoopVideo from "@/components/LoopVideo";
import { DecorMediaProvider, DecorMedia } from "@/components/DecorMedia";
import {
  BookOpen,
  Target,
  CheckCircle2,
  ChevronLeft,
  ListChecks,
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
  X,
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
  target: Target,
  "calendar-check": CalendarCheck,
};

type StudentToolCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  kind: string;
};

// A personalized recommendation card returned by /api/ai/assistant. Every card
// carries a concrete action so clicking it always DOES something.
type Suggestion = {
  label: string;
  why: string;
  icon?: string;
  tone?: "brand" | "green" | "amber" | "violet";
  target: {
    lessonId?: string;
    // open_lesson | open_practice | review_plan | none
    action?: string;
  };
};

function StudentInner() {
  const params = useSearchParams();
  const router = useRouter();
  const studentId = params.get("id") || "";
  const [tokenReady, setTokenReady] = useState(false);

  // Capture the per-student token from the URL hash (#t=...) on mount. The hash
  // survives refresh and is never sent to the server. Without a token, the
  // student API calls will 401 and we send the student back to sign in.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const m = hash.match(/[#&]t=([^&]+)/);
    if (m) {
      setStudentToken(decodeURIComponent(m[1]));
    }
    setTokenReady(true);
  }, []);

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [active, setActive] = useState<Lesson | null>(null);
  // When opening a lesson from a "jump into practice" suggestion we deep-link
  // straight to the Practice tab instead of the reading tab.
  const [activeTab, setActiveTab] = useState<"lesson" | "practice">("lesson");
  const [loading, setLoading] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const planRef = useRef<HTMLDivElement | null>(null);
  const lessonsRef = useRef<HTMLHeadingElement | null>(null);
  // Ranked, personalized "what to do next" cards (each is actionable).
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // True while the personalized recommendations are being fetched/built, so we
  // can show skeleton shimmer cards in the destination region instead of an
  // abrupt silent pop-in once they arrive.
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Polite screen-reader announcement when recommendations arrive.
  const [srAnnounce, setSrAnnounce] = useState("");
  // Briefly pulse-highlight the study-plan card when a "review plan" card is
  // tapped, so the eye is guided to what changed.
  const [planHighlight, setPlanHighlight] = useState(false);
  const [mood, setMood] = useState<string>("steady");
  const nudgeFetched = useRef(false);
  const autoGenFired = useRef(false);
  const [tools, setTools] = useState<StudentToolCard[]>([]);
  // Currently-open study tool (rendered in a focused modal popup).
  const [activeTool, setActiveTool] = useState<StudentToolCard | null>(null);
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
    if (!getStudentToken()) {
      // No valid session token (e.g. opened with a bare ?id= URL). Require login.
      router.push("/");
      return;
    }
    setLoading(true);
    const [sRes, lRes, pRes] = await Promise.all([
      studentFetch(`/api/students/${studentId}`).then((r) => r.json()),
      studentFetch(`/api/lessons?studentId=${studentId}`).then((r) => r.json()),
      studentFetch(`/api/progress?studentId=${studentId}`).then((r) => r.json()),
    ]);
    const me: Student | undefined = sRes.student || undefined;
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
      // Show skeleton cards in the destination region while the helper builds
      // the personalized recommendations (this can take several seconds).
      setSuggestionsLoading(true);
      studentFetch("/api/ai/assistant", {
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
          const list: Suggestion[] = Array.isArray(d?.actions) ? d.actions : [];
          if (list.length) {
            setSuggestions(list.slice(0, 5));
            // Announce politely for screen-reader users (the visual reveal is
            // invisible to them).
            setSrAnnounce(
              `${list.slice(0, 5).length} personalized recommendations are ready.`
            );
          }
          if (d?.mood) setMood(d.mood);
        })
        .catch(() => {})
        .finally(() => setSuggestionsLoading(false));
    }

    // Prepare-ahead: fire-and-forget a background CHAIN that auto-generates a
    // fresh DRAFT lesson set so the teacher never waits for generation. The
    // endpoint builds ONE lesson per call and reports {done}. We keep calling it
    // until the set is complete, so lessons land one after another. It is
    // idempotent + debounced (skips when a set is already waiting or was
    // prepared recently), so this is safe to start on every login. We never
    // block the UI on it; when the set completes it raises the admin alarm.
    if (me.status === "active" && !autoGenFired.current) {
      autoGenFired.current = true;
      const chain = async () => {
        // Hard safety cap so a persistent failure can never loop forever.
        for (let i = 0; i < 8; i++) {
          try {
            const r = await studentFetch("/api/generate-lessons-bulk/auto", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ studentId }),
            });
            if (!r.ok) break;
            const d = await r.json().catch(() => null);
            if (!d || d.done) break; // finished, skipped, or complete
          } catch {
            break;
          }
        }
      };
      chain();
    }

    // Load any tools the teacher has approved for this student.
    if (me.status === "active") {
      studentFetch(`/api/student-tools?studentId=${studentId}&status=approved`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.tools) setTools(d.tools);
        })
        .catch(() => {});
    }
  }

  useEffect(() => {
    if (!tokenReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, tokenReady]);

  const progFor = (id: string) => progress.find((p) => p.lesson_id === id);
  const completedCount = progress.filter((p) => p.completed).length;

  // Open a lesson, optionally landing straight on its Practice tab.
  function openLesson(lesson: Lesson, tab: "lesson" | "practice" = "lesson", via = "suggestion") {
    tracker?.track("lesson_open", {
      lessonId: lesson.id,
      meta: { title: lesson.title, section: lesson.section, via, tab },
    });
    setActiveTab(tab);
    setActive(lesson);
  }

  // Smooth-scroll a target element so it lands BELOW the sticky header with
  // breathing room (offset), then briefly highlight it. Never jam it to the
  // top edge, and never yank the page to the very bottom. Respects reduced
  // motion (the CSS sets scroll-behavior:auto, and we skip the highlight feel).
  function revealPlan() {
    setShowPlan(true);
    // Wait for the plan body to expand, then scroll with a header offset.
    setTimeout(() => {
      const el = planRef.current;
      if (!el) return;
      const headerOffset = 84; // sticky header height + breathing room
      const y =
        el.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
      // Pulse-highlight so the eye is drawn to what just changed.
      setPlanHighlight(true);
      window.setTimeout(() => setPlanHighlight(false), 1900);
    }, 90);
  }

  // Execute a recommendation card. Every card does something real.
  function runSuggestion(s: Suggestion) {
    const action = s.target?.action;
    if (action === "review_plan") {
      revealPlan();
      return;
    }
    if (s.target?.lessonId) {
      const target = lessons.find((l) => l.id === s.target.lessonId);
      if (target) {
        openLesson(target, action === "open_practice" ? "practice" : "lesson");
        return;
      }
    }
    // "none" / encouragement: jump to the first unfinished lesson, else top.
    const next =
      lessons.find((l) => !progFor(l.id)?.completed) || lessons[0] || null;
    if (next) openLesson(next, "lesson", "encouragement");
  }

  // Card accent classes by tone.
  const SUGGESTION_TONES: Record<string, { ring: string; chip: string; arrow: string }> = {
    brand: { ring: "border-brand-200 hover:border-brand-400", chip: "bg-brand-100 text-brand-700", arrow: "text-brand-600" },
    green: { ring: "border-green-200 hover:border-green-400", chip: "bg-green-100 text-green-700", arrow: "text-green-600" },
    amber: { ring: "border-amber-200 hover:border-amber-400", chip: "bg-amber-100 text-amber-700", arrow: "text-amber-600" },
    violet: { ring: "border-violet-200 hover:border-violet-400", chip: "bg-violet-100 text-violet-700", arrow: "text-violet-600" },
  };

  if (loading) {
    return <LoadingScreen />;
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
        initialTab={activeTab}
        onBack={() => {
          setActive(null);
          setActiveTab("lesson");
          load();
        }}
      />
    );
  }

  return (
    <DecorMediaProvider
      role="student"
      studentId={studentId}
      authHeaders={() => {
        const h: Record<string, string> = {};
        const t = getStudentToken();
        if (t) h["x-student-token"] = t;
        return h;
      }}
    >
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
        {/* Decorative dashboard hero banner — student can hide it from their own
            view (hover delete); restores via a low-opacity pill. */}
        <DecorMedia
          mediaKey="student-hero"
          kind="image"
          src="/decor/student-hero.webp"
          alt=""
          aspect="aspect-[16/5]"
          className="mb-6 border border-line shadow-card animate-fadeUp"
        />

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

        {/* Polite live region so screen-reader users are told recommendations
            arrived (the visual reveal is invisible to them). Lives in the
            initial markup so assistive tech picks up the later update. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {srAnnounce}
        </div>

        {/* Loading state: skeleton shimmer cards in the SAME destination region
            and layout as the real cards, so the transition is a fill (not an
            abrupt pop-in) and the layout never shifts. */}
        {suggestionsLoading && suggestions.length === 0 && (
          <section className="mt-7 animate-fadeUp" aria-hidden="true">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg skeleton-shimmer" />
              <span className="h-5 w-44 rounded skeleton-shimmer" />
            </div>
            <span className="mt-2 block h-4 w-72 max-w-full rounded skeleton-shimmer" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex h-44 flex-col rounded-2xl border border-line bg-white p-5 shadow-card"
                >
                  <span className="h-11 w-11 rounded-xl skeleton-shimmer" />
                  <span className="mt-4 h-4 w-3/4 rounded skeleton-shimmer" />
                  <span className="mt-2 h-3 w-full rounded skeleton-shimmer" />
                  <span className="mt-1.5 h-3 w-5/6 rounded skeleton-shimmer" />
                  <span className="mt-auto h-4 w-24 rounded skeleton-shimmer" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Personalized "recommended for you" cards. Each card runs a real
            action on click: open a lesson, jump straight into practice, or open
            the study plan. Adapts in count (3-5) and tone to the student.
            Cards enter staggered (priority order lands first) rather than all
            at once, so the reveal is legible instead of startling. */}
        {suggestions.length > 0 && (
          <section className="mt-7 animate-fadeUp">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${
                  mood === "thriving"
                    ? "bg-green-600"
                    : mood === "struggling"
                    ? "bg-amber-500"
                    : "bg-brand-600"
                }`}
              >
                {mood === "thriving" ? (
                  <Trophy size={15} />
                ) : mood === "struggling" ? (
                  <Heart size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
              </span>
              <h2 className="font-display text-lg font-extrabold text-ink">
                Recommended for you
              </h2>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              {mood === "thriving"
                ? "You're on a roll. Here's where to push next."
                : mood === "struggling"
                ? "Small steps that build momentum. Tap any card to begin."
                : "Pick any card to jump straight into your next move."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {suggestions.map((s, i) => {
                const Icon = (s.icon && TOOL_ICONS[s.icon]) || Sparkles;
                const t = SUGGESTION_TONES[s.tone || "brand"] || SUGGESTION_TONES.brand;
                const cta =
                  s.target?.action === "open_practice"
                    ? "Start practice"
                    : s.target?.action === "review_plan"
                    ? "View plan"
                    : "Open lesson";
                return (
                  <button
                    key={i}
                    onClick={() => runSuggestion(s)}
                    data-testid={`suggestion-${i}`}
                    style={{ ["--i" as any]: i }}
                    className={`group flex h-full flex-col rounded-2xl border bg-white p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-pop animate-cardIn ${t.ring}`}
                  >
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${t.chip}`}>
                      <Icon size={22} />
                    </span>
                    <h3 className="mt-4 font-display text-base font-bold leading-snug text-ink">
                      {s.label}
                    </h3>
                    <p className="mt-1 flex-1 text-sm text-ink-muted">{s.why}</p>
                    <span className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${t.arrow}`}>
                      {cta}
                      <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
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
          <div ref={planRef}>
          <Card className={`mt-3 p-4 animate-fadeUp scroll-mt-24 ${planHighlight ? "animate-highlight" : ""}`}>
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
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat
            icon={<BookOpen size={18} />}
            value={lessons.length}
            label="Lessons"
            onClick={() =>
              lessonsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <Stat
            icon={<CheckCircle2 size={18} />}
            value={completedCount}
            label="Completed"
            tone="green"
            onClick={() =>
              lessonsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          />
          <Stat
            icon={<Target size={18} />}
            value={student?.target_score ?? "—"}
            label="Target score"
            tone="brand"
            onClick={student?.study_plan ? revealPlan : undefined}
          />
        </div>

        {/* Tutor-unlocked study tools. Clicking a tool opens it in a focused
            popup (timer/flashcards/etc.) so every card actually does something. */}
        {tools.length > 0 && (
          <>
            <h2 className="mt-9 text-sm font-bold uppercase tracking-wide text-ink-muted">
              Study tools
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => {
                const Icon = TOOL_ICONS[t.icon] || Sparkles;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      tracker?.track("tool_open", {
                        meta: { id: t.id, title: t.title, kind: t.kind },
                      });
                      setActiveTool(t);
                    }}
                    data-testid={`tool-${t.id}`}
                    className="group flex items-start gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-pop animate-fadeUp"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{t.title}</p>
                      <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
                        Open <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* lessons */}
        <h2
          ref={lessonsRef}
          className="mt-9 scroll-mt-24 text-sm font-bold uppercase tracking-wide text-ink-muted"
        >
          Your lessons
        </h2>

        {lessons.length === 0 ? (
          <Card className="mt-3 flex flex-col items-center p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 animate-pulse">
              <Clock size={30} />
            </div>
            <p className="mt-4 font-display text-lg font-extrabold text-ink">
              No lessons yet
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Your tutor is adding personalized lessons here soon.
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
                    onClick={() => openLesson(l, "lesson", "lesson_list")}
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

        {/* Student media: view what the tutor created + request new media */}
        <StudentMedia studentId={studentId} />
      </div>

      {/* Focused study-tool popup */}
      {activeTool && (
        <ToolModal
          tool={activeTool}
          onClose={() => setActiveTool(null)}
          onOpenLesson={(tab) => {
            const next =
              lessons.find((l) => !progFor(l.id)?.completed) || lessons[0] || null;
            setActiveTool(null);
            if (next) openLesson(next, tab, "tool");
          }}
        />
      )}
    </main>
    </DecorMediaProvider>
  );
}

function Stat({
  icon,
  value,
  label,
  tone = "slate",
  onClick,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone?: "slate" | "green" | "brand";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    slate: "text-ink-soft bg-slate-100",
    green: "text-green-700 bg-green-50",
    brand: "text-brand-700 bg-brand-50",
  };
  const inner = (
    <>
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
    </>
  );
  if (onClick) {
    return (
      <Card className="p-4">
        <button
          onClick={onClick}
          className="w-full text-left transition hover:opacity-80"
        >
          {inner}
        </button>
      </Card>
    );
  }
  return <Card className="p-4">{inner}</Card>;
}

// ---------------- Study-tool popup ----------------
// Tutor-unlocked tools (timer, flashcards, etc.) open here as a focused modal.
// Some tools are interactive (a real countdown timer); all offer a clear
// next action so the popup is never a dead end.
function ToolModal({
  tool,
  onClose,
  onOpenLesson,
}: {
  tool: StudentToolCard;
  onClose: () => void;
  onOpenLesson: (tab: "lesson" | "practice") => void;
}) {
  const Icon = TOOL_ICONS[tool.icon] || Sparkles;
  const isTimer = tool.icon === "timer" || /timer|focus|pomodoro/i.test(tool.title);
  // Simple, real countdown for timer-type tools.
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fadeUp"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
              <Icon size={22} />
            </span>
            <div>
              <h3 className="font-display text-lg font-extrabold text-ink">{tool.title}</h3>
              <p className="text-sm text-ink-muted">{tool.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="tool-close"
            className="rounded-lg p-1 text-ink-muted hover:bg-paper hover:text-ink"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {isTimer ? (
          <div className="mt-6 text-center">
            <p className="font-display text-6xl font-extrabold tabular-nums text-ink">
              {mm}:{ss}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button onClick={() => setRunning((r) => !r)} data-testid="timer-toggle">
                {running ? "Pause" : "Start"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRunning(false);
                  setSeconds(25 * 60);
                }}
              >
                Reset
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink-soft">
              A focused 25-minute study sprint. Pair it with a lesson below.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-xl bg-paper p-4 text-sm text-ink-soft">
            Use this alongside your lessons. Jump into practice and this tool will
            help you stay on track.
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={() => onOpenLesson("practice")}>
            Start practice <ListChecks size={16} />
          </Button>
          <Button variant="ghost" onClick={() => onOpenLesson("lesson")}>
            Open a lesson
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Lesson view with practice ----------------
function LessonView({
  lesson,
  studentId,
  tracker,
  existing,
  initialTab = "lesson",
  onBack,
}: {
  lesson: Lesson;
  studentId: string;
  tracker: Tracker | null;
  existing?: Progress;
  initialTab?: "lesson" | "practice";
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"lesson" | "practice" | "plan">(initialTab);
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
    await studentFetch("/api/progress", {
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
                  <div className="font-semibold text-ink">
                    <span className="text-brand-600">Q{i + 1}.</span>
                    <div className="mt-1 font-normal">
                      <Markdown>{q.prompt}</Markdown>
                    </div>
                  </div>
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
                          <span className="choice-md">
                            <Markdown>{c.replace(/^[A-D][).\s]*/, "")}</Markdown>
                          </span>
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
              <Card className="flex flex-col items-center p-7 text-center animate-fadeUp">
                {/* Wordless "finished!" celebration loop — the clear visual cue
                    that this lesson is DONE. */}
                <LoopVideo
                  src="/success.mp4"
                  poster="/success-poster.jpg"
                  label="Lesson complete"
                  size="w-28"
                />
                {/* Big score, high contrast. */}
                <p className="mt-2 font-display text-5xl font-extrabold text-brand-600">
                  {score}%
                </p>
                {/* Visual correct/total dots so the result reads without English. */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  {questions.map((_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${
                        i < correctCount ? "bg-green-500" : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CheckCircle2 size={16} className="text-green-600" />
                  {correctCount} / {questions.length} correct
                  {saving && (
                    <span className="ml-1 text-ink-muted">· saving…</span>
                  )}
                </p>
                <div className="mt-5">
                  <Button onClick={onBack}>
                    Back to lessons <ArrowRight size={16} />
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

// Wordless "the app is working" wait screen. Shown while the student dashboard
// loads. The looping animation is the universal cue that things are active —
// no English needed.
function LoadingScreen() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-5 bg-paper px-5 text-center">
      <LoopVideo
        src="/loading.mp4"
        poster="/loading-poster.jpg"
        label="Loading your lessons"
        size="w-32"
        className="animate-fadeUp"
      />
      <p className="animate-fadeUp font-display text-lg font-extrabold text-ink">
        Loading{".".repeat(3)}
      </p>
    </main>
  );
}

export default function StudentPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <StudentInner />
    </Suspense>
  );
}

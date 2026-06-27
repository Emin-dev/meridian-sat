"use client";

import { useEffect, useRef, useState } from "react";
import { Logo, Card } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import { studentFetch } from "@/lib/studentClient";
import { CheckCircle2, Clock, Mail, Sparkles } from "lucide-react";

// Locked "your teacher is preparing your lessons" screen.
//
// Shown after a student finishes the survey, while their personalized program is
// being prepared and reviewed by their teacher. The student can do NOTHING here
// but wait — this can take days. The screen quietly polls in the background and
// auto-unlocks the moment the teacher approves (student.status becomes "active").
//
// Deliberately written to feel human and personal — it reads as if a real tutor
// is hand-crafting the lessons, with no mention of automation.

const STEPS = [
  { label: "We received your answers", done: true },
  { label: "Your tutor is designing your personal lessons", done: false },
  { label: "Your tutor reviews and approves your plan", done: false },
  { label: "Your lessons unlock — you're ready to start", done: false },
];

export default function Preparing({
  student,
  onReady,
}: {
  student: Student;
  onReady: (updated: Student) => void;
}) {
  const [dots, setDots] = useState(1);
  const polling = useRef(false);

  // Animated ellipsis for the "in progress" line.
  useEffect(() => {
    const t = setInterval(() => setDots((d) => (d % 3) + 1), 600);
    return () => clearInterval(t);
  }, []);

  // Background poll: check every 15s whether the teacher has approved.
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (polling.current) return;
      polling.current = true;
      try {
        const res = await studentFetch(`/api/students/${student.id}`);
        const data = await res.json();
        const me: Student | undefined = data.student || undefined;
        if (me && me.status === "active" && !stopped) {
          onReady(me);
        }
      } catch {
        /* ignore; will retry */
      } finally {
        polling.current = false;
      }
    }
    const t = setInterval(check, 15000);
    check();
    return () => {
      stopped = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600">
            <Clock size={14} /> Preparing
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-12">
        <div className="text-center animate-fadeUp">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Sparkles size={30} />
          </div>
          <h1 className="mt-6 font-display text-2xl font-extrabold text-ink">
            Thanks, {student.name?.split(" ")[0]} — your lessons are being
            prepared
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Your tutor is putting together a study plan and lessons made just for
            you, based on your answers. This is done personally and carefully, so
            it can take a little time — sometimes a day or two.
          </p>
          <p className="mt-2 text-sm font-medium text-ink-muted">
            You don&apos;t need to do anything. The moment your plan is ready,
            this page will open automatically{".".repeat(dots)}
          </p>
        </div>

        <Card className="mt-8 p-5 animate-fadeUp">
          <ul className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    s.done
                      ? "bg-green-50 text-green-600"
                      : i === 1
                        ? "bg-brand-50 text-brand-600"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {s.done ? (
                    <CheckCircle2 size={15} />
                  ) : i === 1 ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                  )}
                </span>
                <span
                  className={`text-sm ${
                    s.done
                      ? "font-medium text-ink line-through decoration-green-300"
                      : i === 1
                        ? "font-semibold text-ink"
                        : "text-ink-muted"
                  }`}
                >
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <Mail size={14} />
          You can safely close this page and come back later — your spot is saved.
        </div>
      </div>
    </main>
  );
}

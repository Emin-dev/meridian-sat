"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import { studentFetch } from "@/lib/studentClient";
import { Check, Clock, PenLine, Unlock } from "lucide-react";

// Locked "your teacher is preparing your lessons" screen.
//
// Shown after a student finishes the survey, while their personalized program is
// being prepared and reviewed by their teacher. The student can do NOTHING here
// but wait — this can take days. The screen quietly polls in the background and
// auto-unlocks the moment the teacher approves (student.status becomes "active").
//
// Designed to be understood at a glance, even by students with little English:
// a friendly looping animation does the explaining, big text is minimal, and a
// simple 3-icon strip shows where things are. The clear visual message is
// "we're working on it — you don't need to do anything."

// Three big, icon-led stages. Stage 2 (the pen) is the active one.
const STEPS = [
  { icon: Check, key: "done" as const },
  { icon: PenLine, key: "active" as const },
  { icon: Unlock, key: "todo" as const },
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
    <main className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Logo />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
            <Clock size={14} /> Preparing
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-5 py-8 text-center">
        {/* Big, wordless animation — the main explanation. */}
        <div className="animate-fadeUp w-full max-w-sm overflow-hidden rounded-3xl">
          <video
            src="/preparing.mp4"
            poster="/preparing-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            className="h-auto w-full"
            aria-label="Your personal lessons are being prepared"
          />
        </div>

        {/* Minimal, big text. */}
        <h1 className="animate-fadeUp mt-4 font-display text-3xl font-extrabold leading-tight text-ink">
          Building your lessons{".".repeat(dots)}
        </h1>
        <p className="animate-fadeUp mt-2 text-base font-medium text-ink-soft">
          Just for you, {student.name?.split(" ")[0]}. This page opens by itself
          when ready.
        </p>

        {/* Visual 3-step strip — icons carry the meaning, not words. */}
        <div className="animate-fadeUp mt-8 flex w-full items-center justify-center gap-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.key === "active";
            const done = s.key === "done";
            return (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl transition ${
                    done
                      ? "bg-green-50 text-green-600"
                      : active
                        ? "animate-pulse bg-brand-600 text-white shadow-pop"
                        : "bg-slate-100 text-slate-300"
                  }`}
                >
                  <Icon size={24} strokeWidth={2.4} />
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={`h-0.5 w-8 rounded-full ${
                      done ? "bg-green-300" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* One small reassurance line. */}
        <p className="animate-fadeUp mt-6 text-sm text-ink-muted">
          You can close this page — your spot is saved.
        </p>
      </div>
    </main>
  );
}

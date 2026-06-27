"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Card, Spinner } from "@/components/ui";
import { ShieldCheck, ArrowRight } from "lucide-react";

// Minimalist, ad-style landing page for MeridianSAT.
// Single focus: a student enters their access code and is signed in
// AUTOMATICALLY — no button to press. Less text, one clear action.
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");
  const lastTried = useRef("");

  async function attempt(raw: string) {
    const value = raw.trim();
    // Only auto-try once a plausibly complete code is entered, and never retry
    // the exact same failed value.
    if (value.length < 4 || value === lastTried.current) return;
    lastTried.current = value;
    setStatus("checking");
    setError("");
    try {
      const res = await fetch("/api/student-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data.error || "We don't recognize that code yet.");
        return;
      }
      // Signed in — go straight to the student area. The per-student token is
      // passed in the URL hash (#t=...): it survives refresh, is never sent to
      // the server, and never appears in server/access logs.
      const tok = data.token ? `#t=${encodeURIComponent(data.token)}` : "";
      router.push(`/student?id=${data.student.id}${tok}`);
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  }

  // Debounced auto-login as the student types.
  useEffect(() => {
    const value = code.trim();
    if (value.length < 4) {
      setStatus("idle");
      return;
    }
    const t = setTimeout(() => attempt(value), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-paper">
      {/* soft brand glow background */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl"
      />

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <button
          onClick={() => router.push("/admin")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          <ShieldCheck size={16} /> Tutor
        </button>
      </header>

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <h1 className="font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-ink md:text-5xl animate-fadeUp">
          Your SAT,
          <br />
          made <span className="text-brand-600">just for you</span>.
        </h1>
        <p className="mt-4 max-w-sm text-base text-ink-soft animate-fadeUp">
          Lessons built around your goals. Enter your code to begin.
        </p>

        <Card className="mt-6 w-full max-w-sm p-6 animate-fadeUp">
          <div className="relative">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && attempt(code)}
              autoFocus
              placeholder="ENTER YOUR CODE"
              className="w-full rounded-xl border border-line bg-white px-4 py-4 text-center text-lg font-semibold uppercase tracking-[0.25em] text-ink outline-none transition focus:border-brand-400"
            />
            {status === "checking" && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-600">
                <Spinner className="h-5 w-5" />
              </span>
            )}
            {status === "idle" && code.trim().length >= 4 && (
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-400">
                <ArrowRight size={18} />
              </span>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
          )}
          <p className="mt-4 text-xs text-ink-muted">
            {status === "checking"
              ? "Signing you in…"
              : "You're signed in automatically — no password needed."}
          </p>
        </Card>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Button, Card, Input, Spinner } from "@/components/ui";
import { GraduationCap, ShieldCheck, Sparkles, BookOpen, Target, ArrowRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/student-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code.");
        return;
      }
      // pass student id via URL (simple, no cookies/localStorage needed)
      router.push(`/student?id=${data.student.id}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen">
      {/* top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <button
          onClick={() => router.push("/admin")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ShieldCheck size={16} /> Admin
        </button>
      </header>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-6 md:grid-cols-2 md:gap-16 md:pt-16">
        {/* left: pitch */}
        <div className="animate-fadeUp">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            <Sparkles size={14} /> Powered by DeepSeek V4 Pro
          </span>
          <h1 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
            Personalized SAT lessons,
            <br />
            built for <span className="text-brand-600">you</span>.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-ink-soft">
            Custom lessons, real SAT-style practice questions, and a study plan
            tuned to your goals and weak spots. Just enter the access code your
            tutor gave you.
          </p>

          <div className="mt-8 grid max-w-md grid-cols-3 gap-3">
            <Feature icon={<BookOpen size={18} />} label="Concept lessons" />
            <Feature icon={<Target size={18} />} label="Targeted practice" />
            <Feature icon={<GraduationCap size={18} />} label="Study plans" />
          </div>
        </div>

        {/* right: login card */}
        <div className="animate-fadeUp">
          <Card className="p-7">
            <h2 className="text-lg font-bold text-ink">Student sign in</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Enter your access code to start learning.
            </p>
            <div className="mt-5 space-y-3">
              <Input
                value={code}
                onChange={setCode}
                placeholder="e.g. EMMA2026"
                className="text-center text-lg font-semibold tracking-widest uppercase"
              />
              {error && (
                <p className="text-sm font-medium text-red-600">{error}</p>
              )}
              <Button
                onClick={login}
                disabled={loading || !code.trim()}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Spinner /> Signing in…
                  </>
                ) : (
                  <>
                    Start learning <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </div>
            <p className="mt-5 text-center text-xs text-ink-muted">
              Don&apos;t have a code? Ask your tutor to create your account.
            </p>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-center shadow-card">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        {icon}
      </div>
      <p className="mt-2 text-xs font-semibold text-ink-soft">{label}</p>
    </div>
  );
}

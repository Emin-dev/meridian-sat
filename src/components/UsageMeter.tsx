"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { Gauge, AlertTriangle, Clock, Ban } from "lucide-react";

export type RateStatus = {
  allowed: boolean;
  tier: "ok" | "warn" | "throttle" | "block";
  count: number;
  limit: number;
  hardLimit: number;
  bonus: number;
  retryAfter: number;
  warn: boolean;
  message: string;
  blockedUntil: string | null;
};

const TONES: Record<string, { bar: string; ring: string; text: string }> = {
  ok: { bar: "bg-brand-500", ring: "border-line", text: "text-ink-soft" },
  warn: { bar: "bg-amber-500", ring: "border-amber-200", text: "text-amber-700" },
  throttle: { bar: "bg-orange-500", ring: "border-orange-200", text: "text-orange-700" },
  block: { bar: "bg-red-500", ring: "border-red-200", text: "text-red-700" },
};

/**
 * A compact daily-usage meter for one student's AI request budget. Shown to BOTH
 * the admin (inside the student detail page) and the student (their own screen).
 *
 * Re-fetches itself; pass `refreshKey` to force a refresh after an action (e.g.
 * the admin granting bonus requests).
 */
export default function UsageMeter({
  studentId,
  compact = false,
  refreshKey = 0,
}: {
  studentId: string;
  compact?: boolean;
  refreshKey?: number;
}) {
  const [rate, setRate] = useState<RateStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/ai-usage?studentId=${studentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setRate(d.rate || null);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [studentId, refreshKey]);

  if (loading && !rate) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <Spinner className="h-3.5 w-3.5" /> Loading usage…
      </div>
    );
  }
  if (!rate) return null;

  const tone = TONES[rate.tier] || TONES.ok;
  const pct = Math.min(100, Math.round((rate.count / rate.limit) * 100));
  const Icon =
    rate.tier === "block"
      ? Ban
      : rate.tier === "throttle"
      ? Clock
      : rate.tier === "warn"
      ? AlertTriangle
      : Gauge;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Icon size={14} className={tone.text} />
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper">
          <div className={`h-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-semibold ${tone.text}`}>
          {rate.count}/{rate.limit}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${tone.ring} bg-white p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={16} className={tone.text} />
          <span className="text-sm font-bold text-ink">Today&apos;s AI requests</span>
        </div>
        <span className={`text-sm font-bold ${tone.text}`}>
          {rate.count} / {rate.limit}
          {rate.bonus > 0 && (
            <span className="ml-1 text-xs font-medium text-ink-muted">
              (+{rate.bonus} bonus)
            </span>
          )}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
        <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {rate.message ? (
        <p className={`mt-2.5 text-xs font-medium ${tone.text}`}>{rate.message}</p>
      ) : (
        <p className="mt-2.5 text-xs text-ink-muted">
          Resets daily. Throttles after {rate.limit}, hard limit at {rate.hardLimit}.
        </p>
      )}
    </div>
  );
}

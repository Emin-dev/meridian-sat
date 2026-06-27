"use client";

import { useMemo, useState } from "react";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import {
  Activity,
  Clock,
  Flame,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { adminFetch } from "@/lib/adminClient";

// Admin insights: at a glance, who is studying and who isn't, how much time each
// student spends, plus AI-generated labels, key points and recommendations.

function fmtMins(seconds: number) {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function sinceLabel(iso: string | null) {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function labelTone(label: string): "good" | "warn" | "risk" {
  const l = label.toLowerCase();
  if (/(risk|inactive|slipping|behind|avoid|low|not start)/.test(l)) return "risk";
  if (/(track|strong|great|good|consistent|improv)/.test(l)) return "good";
  return "warn";
}

export default function AdminInsights({
  students,
  reload,
}: {
  students: Student[];
  reload: () => void;
}) {
  const [refreshing, setRefreshing] = useState<string>("");
  const [refreshingAll, setRefreshingAll] = useState(false);

  // sort: most at-risk / least active first so the teacher sees who needs help
  const sorted = useMemo(
    () =>
      [...students].sort(
        (a, b) => (a.engagement_score || 0) - (b.engagement_score || 0)
      ),
    [students]
  );

  const active7d = students.filter(
    (s) =>
      s.last_active_at &&
      Date.now() - new Date(s.last_active_at).getTime() < 7 * 86400000
  ).length;
  const totalStudy = students.reduce(
    (a, s) => a + (s.total_study_seconds || 0),
    0
  );

  async function refresh(id: string) {
    setRefreshing(id);
    try {
      await adminFetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id }),
      });
      reload();
    } finally {
      setRefreshing("");
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    try {
      for (const s of students) {
        await adminFetch("/api/ai/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: s.id }),
        });
      }
      reload();
    } finally {
      setRefreshingAll(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Student insights</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Who&apos;s studying, who&apos;s falling behind, and what to do about
            it.
          </p>
        </div>
        <Button onClick={refreshAll} disabled={refreshingAll || students.length === 0}>
          {refreshingAll ? <Spinner /> : <Sparkles size={15} />}
          Refresh all insights
        </Button>
      </div>

      {/* summary KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={<Activity size={16} />} label="Active this week" value={`${active7d}/${students.length}`} />
        <Kpi icon={<Clock size={16} />} label="Total study time" value={fmtMins(totalStudy)} />
        <Kpi
          icon={<AlertTriangle size={16} />}
          label="Need attention"
          value={String(
            students.filter((s) => (s.engagement_score || 0) < 35).length
          )}
          tone="risk"
        />
        <Kpi
          icon={<TrendingUp size={16} />}
          label="Avg engagement"
          value={
            students.length
              ? Math.round(
                  students.reduce((a, s) => a + (s.engagement_score || 0), 0) /
                    students.length
                ) + ""
              : "—"
          }
        />
      </div>

      {sorted.length === 0 ? (
        <Card className="mt-5 p-10 text-center text-ink-muted">
          No students yet.
        </Card>
      ) : (
        <div className="mt-5 space-y-3">
          {sorted.map((s) => {
            const ins = s.insights || {};
            const recs = s.recommendations || {};
            const bd = (ins as any).breakdown || {};
            const labels = s.labels && s.labels.length ? s.labels : [];
            return (
              <Card key={s.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-ink">{s.name}</h3>
                      {labels.map((l) => (
                        <Badge
                          key={l}
                          tone={
                            labelTone(l) === "good"
                              ? "green"
                              : labelTone(l) === "risk"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {l}
                        </Badge>
                      ))}
                    </div>
                    {(ins as any).headline && (
                      <p className="mt-1 text-sm text-ink-soft">
                        {(ins as any).headline}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => refresh(s.id)}
                    disabled={refreshing === s.id}
                  >
                    {refreshing === s.id ? <Spinner /> : <RefreshCw size={14} />}
                  </Button>
                </div>

                {/* metrics row */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric
                    label="Engagement"
                    value={`${s.engagement_score || 0}`}
                    bar={s.engagement_score || 0}
                  />
                  <Metric label="Study time" value={fmtMins(s.total_study_seconds || 0)} />
                  <Metric
                    label="Streak"
                    value={`${s.streak_days || 0}d`}
                    icon={<Flame size={13} className="text-amber-500" />}
                  />
                  <Metric label="Last active" value={sinceLabel(s.last_active_at)} />
                </div>

                {/* time breakdown */}
                {(bd.reading_minutes != null || bd.practice_minutes != null) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
                    <span className="rounded-full bg-paper px-2.5 py-1">
                      Reading {bd.reading_minutes || 0}m
                    </span>
                    <span className="rounded-full bg-paper px-2.5 py-1">
                      Practice {bd.practice_minutes || 0}m
                    </span>
                    <span className="rounded-full bg-paper px-2.5 py-1">
                      Lessons {bd.lessons_completed || 0}/{bd.lessons_total || 0}
                    </span>
                    {bd.practice_accuracy != null && (
                      <span className="rounded-full bg-paper px-2.5 py-1">
                        Accuracy {bd.practice_accuracy}%
                      </span>
                    )}
                  </div>
                )}

                {/* key points + recommendations */}
                {((ins as any).key_points?.length || (recs as any).items?.length) ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {(ins as any).key_points?.length > 0 && (
                      <div className="rounded-xl bg-paper p-3">
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
                          Key points
                        </p>
                        <ul className="space-y-1 text-sm text-ink-soft">
                          {(ins as any).key_points.map((k: string, i: number) => (
                            <li key={i} className="flex gap-1.5">
                              <span className="text-brand-500">•</span> {k}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(recs as any).items?.length > 0 && (
                      <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">
                          Recommended next steps
                        </p>
                        <ul className="space-y-1 text-sm text-ink-soft">
                          {(recs as any).items.map((k: string, i: number) => (
                            <li key={i} className="flex gap-1.5">
                              <span className="text-brand-500">→</span> {k}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-ink-muted">
                    No insights yet — click refresh to analyze this student&apos;s
                    activity.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "risk";
}) {
  return (
    <Card className="p-4">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
          tone === "risk"
            ? "bg-amber-50 text-amber-600"
            : "bg-brand-50 text-brand-600"
        }`}
      >
        {icon}
      </div>
      <p className="mt-2.5 text-xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
    </Card>
  );
}

function Metric({
  label,
  value,
  bar,
  icon,
}: {
  label: string;
  value: string;
  bar?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-ink">
        {icon}
        {value}
      </p>
      {bar != null && (
        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
          <div
            className={`h-1.5 rounded-full ${
              bar >= 60
                ? "bg-green-500"
                : bar >= 35
                  ? "bg-brand-500"
                  : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(100, bar)}%` }}
          />
        </div>
      )}
    </div>
  );
}

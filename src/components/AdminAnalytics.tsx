"use client";

import { useMemo, useState } from "react";
import { Card, Badge, Spinner } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  Legend,
} from "recharts";
import {
  Users,
  Activity,
  AlertTriangle,
  Clock,
  Flame,
  TrendingUp,
  Target,
} from "lucide-react";

/* Brand palette pulled from tailwind.config.ts so charts match the app. */
const BRAND = "#1f4ced";
const BRAND_SOFT = "#598dff";
const GREEN = "#16a34a";
const AMBER = "#d97706";
const RED = "#dc2626";
const VIOLET = "#7c3aed";
const SLATE = "#94a3b8";

const PIE_COLORS = [GREEN, BRAND, AMBER, VIOLET, SLATE];

function fmtMins(seconds: number) {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function isActive(s: Student): boolean {
  if (!s.last_active_at) return false;
  const diff = Date.now() - new Date(s.last_active_at).getTime();
  return diff < 1000 * 60 * 60 * 24 * 3; // active within 3 days
}

export default function AdminAnalytics({
  students,
  loading,
  onOpen,
}: {
  students: Student[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  // Cohort filter — pick a tag to scope the whole dashboard to one group.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) for (const t of s.tags || []) set.add(t);
    return Array.from(set).sort();
  }, [students]);

  const [cohort, setCohort] = useState<string>("all");

  const scoped = useMemo(
    () =>
      cohort === "all"
        ? students
        : students.filter((s) => (s.tags || []).includes(cohort)),
    [students, cohort]
  );

  const kpis = useMemo(() => {
    const total = scoped.length;
    const active = scoped.filter(isActive).length;
    const atRisk = scoped.filter(
      (s) => s.onboarded && (s.engagement_score || 0) < 35
    ).length;
    const avgEng = total
      ? Math.round(
          scoped.reduce((a, s) => a + (s.engagement_score || 0), 0) / total
        )
      : 0;
    const totalSecs = scoped.reduce(
      (a, s) => a + (s.total_study_seconds || 0),
      0
    );
    const bestStreak = scoped.reduce(
      (a, s) => Math.max(a, s.streak_days || 0),
      0
    );
    return { total, active, atRisk, avgEng, totalSecs, bestStreak };
  }, [scoped]);

  // Engagement distribution buckets (for the bar chart).
  const engBuckets = useMemo(() => {
    const buckets = [
      { name: "0–24", range: [0, 25], count: 0, fill: RED },
      { name: "25–49", range: [25, 50], count: 0, fill: AMBER },
      { name: "50–74", range: [50, 75], count: 0, fill: BRAND_SOFT },
      { name: "75–100", range: [75, 101], count: 0, fill: GREEN },
    ];
    for (const s of scoped) {
      const e = s.engagement_score || 0;
      const b = buckets.find((b) => e >= b.range[0] && e < b.range[1]);
      if (b) b.count += 1;
    }
    return buckets;
  }, [scoped]);

  // Status breakdown (pie).
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of scoped) {
      const key = s.status || "new";
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [scoped]);

  // Top weak areas across the cohort (bar) — shows where to focus teaching.
  const weakAreas = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of scoped)
      for (const w of s.weak_areas || []) counts[w] = (counts[w] || 0) + 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [scoped]);

  // Per-student study time (top 8) — horizontal-feel bar with study minutes.
  const studyByStudent = useMemo(() => {
    return [...scoped]
      .sort((a, b) => (b.total_study_seconds || 0) - (a.total_study_seconds || 0))
      .slice(0, 8)
      .map((s) => ({
        name: s.name.length > 10 ? s.name.slice(0, 10) + "…" : s.name,
        mins: Math.round((s.total_study_seconds || 0) / 60),
        id: s.id,
      }));
  }, [scoped]);

  // Live leaderboard rows (engagement + activity) — the "realtime" feel.
  const leaderboard = useMemo(
    () =>
      [...scoped]
        .sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0))
        .slice(0, 8),
    [scoped]
  );

  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="h-4 w-4" /> Loading analytics…
      </div>
    );
  }

  return (
    <div data-testid="admin-analytics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Overview</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Live engagement and progress across{" "}
            {cohort === "all" ? "all students" : `the “${cohort}” cohort`}.
          </p>
        </div>
        {/* Cohort filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-ink-soft">Cohort</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <CohortChip
              active={cohort === "all"}
              onClick={() => setCohort("all")}
            >
              All
            </CohortChip>
            {allTags.map((t) => (
              <CohortChip
                key={t}
                active={cohort === t}
                onClick={() => setCohort(t)}
              >
                {t}
              </CohortChip>
            ))}
            {allTags.length === 0 && (
              <span className="text-xs text-ink-muted">
                No tags yet — add tags from the Students tab.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={<Users size={16} />}
          label="Students"
          value={kpis.total}
          tone="brand"
        />
        <Kpi
          icon={<Activity size={16} />}
          label="Active (3d)"
          value={kpis.active}
          tone="green"
        />
        <Kpi
          icon={<AlertTriangle size={16} />}
          label="At risk"
          value={kpis.atRisk}
          tone="red"
        />
        <Kpi
          icon={<TrendingUp size={16} />}
          label="Avg engagement"
          value={kpis.avgEng}
          tone="violet"
        />
        <Kpi
          icon={<Clock size={16} />}
          label="Study time"
          value={fmtMins(kpis.totalSecs)}
          tone="brand"
        />
        <Kpi
          icon={<Flame size={16} />}
          label="Best streak"
          value={`${kpis.bestStreak}d`}
          tone="amber"
        />
      </div>

      {scoped.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-ink-muted">
          No students in this cohort yet.
        </Card>
      ) : (
        <>
          {/* Row 1: engagement gauge + study time bar */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <ChartTitle icon={<Target size={15} />} title="Avg engagement" />
              <div className="relative h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    innerRadius="70%"
                    outerRadius="100%"
                    data={[{ name: "eng", value: kpis.avgEng, fill: BRAND }]}
                    startAngle={90}
                    endAngle={90 - (kpis.avgEng / 100) * 360}
                  >
                    <RadialBar background dataKey="value" cornerRadius={12} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold text-ink">
                    {kpis.avgEng}
                  </span>
                  <span className="text-xs text-ink-muted">out of 100</span>
                </div>
              </div>
            </Card>

            <Card className="p-5 lg:col-span-2">
              <ChartTitle
                icon={<Clock size={15} />}
                title="Study time by student (top 8)"
              />
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={studyByStudent}
                    margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#eef0f6"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e6e8f0" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#f1f5ff" }}
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => [`${v} min`, "Study time"]}
                    />
                    <Bar
                      dataKey="mins"
                      fill={BRAND}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={42}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Row 2: engagement distribution + status pie + weak areas */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <ChartTitle
                icon={<TrendingUp size={15} />}
                title="Engagement distribution"
              />
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={engBuckets}
                    margin={{ top: 8, right: 8, bottom: 0, left: -22 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#eef0f6"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e6e8f0" }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#f1f5ff" }}
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => [`${v} students`, "Count"]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {engBuckets.map((b, i) => (
                        <Cell key={i} fill={b.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <ChartTitle icon={<Users size={15} />} title="Status breakdown" />
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={42}
                      outerRadius={66}
                      paddingAngle={3}
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11, color: "#64748b" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <ChartTitle
                icon={<AlertTriangle size={15} />}
                title="Top weak areas"
              />
              <div className="h-48">
                {weakAreas.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                    No weak areas recorded.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={weakAreas}
                      margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid
                        horizontal={false}
                        stroke="#eef0f6"
                        strokeDasharray="3 3"
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={96}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#f1f5ff" }}
                        contentStyle={tooltipStyle}
                        formatter={(v: any) => [`${v} students`, "Affected"]}
                      />
                      <Bar
                        dataKey="count"
                        fill={VIOLET}
                        radius={[0, 6, 6, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Row 3: live leaderboard with progress bars */}
          <Card className="mt-4 p-5">
            <div className="flex items-center justify-between">
              <ChartTitle
                icon={<Activity size={15} />}
                title="Live student progress"
              />
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Updated {relTime(new Date().toISOString())}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {leaderboard.map((s) => {
                const eng = s.engagement_score || 0;
                const tone =
                  eng >= 75 ? GREEN : eng >= 50 ? BRAND : eng >= 35 ? AMBER : RED;
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    data-testid={`analytics-row-${s.id}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left transition hover:border-brand-300 hover:bg-paper"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {s.name}
                        </span>
                        {isActive(s) ? (
                          <Badge tone="green">active</Badge>
                        ) : null}
                        {(s.tags || []).slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-paper">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(4, eng)}%`,
                            background: tone,
                          }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-ink">{eng}</div>
                      <div className="text-[11px] text-ink-muted">
                        {fmtMins(s.total_study_seconds)} · {relTime(s.last_active_at)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e6e8f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
} as const;

function CohortChip({
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
      data-testid={`cohort-${String(children)}`}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-brand-600 text-white"
          : "border border-line bg-white text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

const KPI_TONES: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
};

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone: keyof typeof KPI_TONES | string;
}) {
  return (
    <Card className="p-4">
      <div
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          KPI_TONES[tone] || KPI_TONES.brand
        }`}
      >
        {icon}
      </div>
      <div className="mt-2.5 text-2xl font-extrabold leading-none text-ink">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-ink-muted">{label}</div>
    </Card>
  );
}

function ChartTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-brand-600">{icon}</span>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
    </div>
  );
}

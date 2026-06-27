"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Button, Card, Input, Textarea, Badge, Spinner, AIButton, Select } from "@/components/ui";
import UsageMeter from "@/components/UsageMeter";
import AdminAnalytics from "@/components/AdminAnalytics";
import { adminFetch, setAdminToken, restoreAdminSession } from "@/lib/adminClient";
import type { Student, Prompt } from "@/lib/supabase";
import {
  Users,
  Settings as SettingsIcon,
  Home,
  KeyRound,
  Copy,
  Check,
  Plus,
  Search,
  ChevronRight,
  Inbox,
  Wand2,
  AlertTriangle,
  Trash2,
  Pencil,
  BarChart3,
  Tag,
  X,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";

type View = "overview" | "students" | "settings";

/* ---- Prebuilt option lists for the New-student form ---- */
const GRADE_OPTIONS = [
  "9th grade",
  "10th grade",
  "11th grade",
  "12th grade",
  "Gap year",
  "Homeschool",
  "Adult learner",
];

// Aspirational SAT target scores — everyone aims high, so just the top
// rounded options (no odd numbers like 1283).
const TARGET_OPTIONS = [1600, 1550, 1500, 1450, 1400, 1300];

// Official Digital SAT skills, grouped so the picker reads naturally.
const WEAK_AREA_GROUPS: { group: string; items: string[] }[] = [
  {
    group: "Reading & Writing",
    items: [
      "Words in context",
      "Text structure and purpose",
      "Cross-text connections",
      "Central ideas and details",
      "Command of evidence",
      "Inferences",
      "Boundaries (punctuation)",
      "Form, structure, and sense",
      "Transitions",
      "Rhetorical synthesis",
    ],
  },
  {
    group: "Math",
    items: [
      "Linear equations",
      "Systems of equations",
      "Nonlinear functions",
      "Ratios, rates, and proportions",
      "Percentages",
      "Data analysis",
      "Probability and statistics",
      "Geometry and trigonometry",
      "Quadratics",
      "Exponents and radicals",
    ],
  },
];
const ALL_WEAK_AREAS = WEAK_AREA_GROUPS.flatMap((g) => g.items);


export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [initing, setIniting] = useState(true);
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [view, setView] = useState<View>("overview");

  const [students, setStudents] = useState<Student[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  // per-student pending counts (review + tools) for the list badges
  const [pending, setPending] = useState<Record<string, number>>({});

  const triedPw = useRef("");

  async function login(value?: string) {
    const pwd = (value ?? pw).trim();
    if (!pwd || pwd === triedPw.current) return;
    triedPw.current = pwd;
    setAuthLoading(true);
    setAuthErr("");
    try {
      const res = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        setAdminToken(d.token || null);
        setAuthed(true);
        loadAll();
      } else {
        const d = await res.json();
        setAuthErr(d.error || "Incorrect password.");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    const v = pw.trim();
    if (v.length < 4) {
      triedPw.current = "";
      return;
    }
    const t = setTimeout(() => login(v), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pw]);

  // Restore an existing admin session from the httpOnly cookie on first load,
  // so a page refresh doesn't force the admin to retype the password.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await restoreAdminSession();
        if (!cancelled && ok) {
          setAuthed(true);
          loadAll();
        }
      } finally {
        if (!cancelled) setIniting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    try {
      await fetch("/api/admin-logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setAdminToken(null);
    setAuthed(false);
    triedPw.current = "";
    setPw("");
    router.push("/");
  }

  async function loadAll() {
    setLoading(true);
    const [s, pr] = await Promise.all([
      adminFetch("/api/students").then((r) => r.json()),
      adminFetch("/api/prompts").then((r) => r.json()),
    ]);
    const studs: Student[] = s.students || [];
    setStudents(studs);
    setPrompts(pr.prompts || []);
    setLoading(false);

    // Compute per-student "needs attention" counts: pending lesson requests +
    // pending tool proposals + stuck students with no draft.
    const counts: Record<string, number> = {};
    try {
      const [reqRes, toolRes] = await Promise.all([
        adminFetch("/api/lesson-requests?status=pending").then((r) => r.json()),
        adminFetch("/api/student-tools?status=pending").then((r) => r.json()),
      ]);
      const reqs = reqRes.requests || [];
      const tools = toolRes.tools || [];
      const pendingReqIds = new Set(reqs.map((r: any) => r.student_id));
      for (const r of reqs) counts[r.student_id] = (counts[r.student_id] || 0) + 1;
      for (const t of tools) counts[t.student_id] = (counts[t.student_id] || 0) + 1;
      // stuck students
      for (const st of studs) {
        if (
          st.onboarded &&
          (st.status === "preparing" || st.status === "new") &&
          !pendingReqIds.has(st.id)
        ) {
          counts[st.id] = (counts[st.id] || 0) + 1;
        }
      }
    } catch {}
    setPending(counts);
  }

  if (initing) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="h-4 w-4" /> Restoring session…
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <Card className="w-full max-w-sm p-7 animate-fadeUp">
          <Logo />
          <h1 className="mt-5 text-lg font-bold text-ink">Admin sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Enter your admin password to manage students and lessons.
          </p>
          <div className="mt-5 space-y-3">
            <div className="relative">
              <Input type="password" value={pw} onChange={setPw} placeholder="Admin password" />
              {authLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-600">
                  <Spinner className="h-4 w-4" />
                </span>
              )}
            </div>
            {authErr && <p className="text-sm font-medium text-red-600">{authErr}</p>}
            <p className="text-center text-xs text-ink-muted">
              {authLoading ? "Signing in…" : "You're signed in automatically."}
            </p>
            <button
              onClick={() => router.push("/")}
              className="mx-auto block text-xs font-medium text-ink-muted hover:text-ink"
            >
              ← Back to student sign in
            </button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="brand">Admin</Badge>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-white p-1">
            <NavBtn active={view === "overview"} onClick={() => setView("overview")}>
              <BarChart3 size={16} /> Overview
            </NavBtn>
            <NavBtn active={view === "students"} onClick={() => setView("students")}>
              <Users size={16} /> Students
            </NavBtn>
            <NavBtn active={view === "settings"} onClick={() => setView("settings")}>
              <SettingsIcon size={16} /> Settings
            </NavBtn>
          </div>
          <button
            onClick={logout}
            className="hidden items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink sm:inline-flex"
          >
            <Home size={16} /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {view === "overview" && (
          <AdminAnalytics
            students={students}
            loading={loading}
            onOpen={(id) => router.push(`/admin/student/${id}`)}
          />
        )}
        {view === "students" && (
          <StudentsList
            students={students}
            loading={loading}
            pending={pending}
            reload={loadAll}
            onOpen={(id) => router.push(`/admin/student/${id}`)}
          />
        )}
        {view === "settings" && <SettingsView prompts={prompts} reload={loadAll} />}
      </div>
    </main>
  );
}

function NavBtn({
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
        active ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

/* ============================ Students list (home) ============================ */

function StudentsList({
  students,
  loading,
  pending,
  reload,
  onOpen,
}: {
  students: Student[];
  loading: boolean;
  pending: Record<string, number>;
  reload: () => void;
  onOpen: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) for (const t of s.tags || []) set.add(t);
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let list = t
      ? students.filter(
          (s) =>
            s.name.toLowerCase().includes(t) ||
            s.access_code.toLowerCase().includes(t) ||
            (s.tags || []).some((tag) => tag.toLowerCase().includes(t))
        )
      : students;
    if (tagFilter !== "all")
      list = list.filter((s) => (s.tags || []).includes(tagFilter));
    // Sort: students needing attention first, then by name.
    return [...list].sort((a, b) => {
      const pa = pending[a.id] || 0;
      const pb = pending[b.id] || 0;
      if (pa !== pb) return pb - pa;
      return a.name.localeCompare(b.name);
    });
  }, [students, q, pending, tagFilter]);

  const needsAttention = Object.values(pending).filter(Boolean).length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === filtered.length
        ? new Set()
        : new Set(filtered.map((s) => s.id))
    );
  }
  const selectedCount = selected.size;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Students</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {students.length} student{students.length === 1 ? "" : "s"}
            {needsAttention > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-amber-600">
                  {needsAttention} need attention
                </span>
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New student
        </Button>
      </div>

      <div className="mt-4">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="search-students"
            placeholder="Search by name or access code…"
            className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand-400"
          />
        </div>
      </div>

      {/* Cohort (tag) filter chips */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tag size={14} className="text-ink-muted" />
        <TagChip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>
          All
        </TagChip>
        {allTags.map((t) => (
          <TagChip key={t} active={tagFilter === t} onClick={() => setTagFilter(t)}>
            {t}
          </TagChip>
        ))}
        {allTags.length === 0 && (
          <span className="text-xs text-ink-muted">
            No tags yet. Select students below to create a cohort tag.
          </span>
        )}
      </div>

      {/* Bulk action bar */}
      {!loading && filtered.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2">
          <button
            onClick={toggleSelectAll}
            data-testid="select-all"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
          >
            {selected.size === filtered.length && filtered.length > 0 ? (
              <CheckSquare size={15} className="text-brand-600" />
            ) : (
              <Square size={15} />
            )}
            Select all
          </button>
          <span className="text-xs text-ink-muted">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : "Select students to tag a cohort"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs font-medium text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            )}
            <Button
              variant={selectedCount > 0 ? "primary" : "ghost"}
              onClick={() => setBulkOpen(true)}
              disabled={selectedCount === 0}
            >
              <Tag size={15} /> Tag selected
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="h-4 w-4" /> Loading students…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-ink-muted">
          {students.length === 0
            ? "No students yet. Create your first student to get started."
            : "No students match your search."}
        </Card>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              pending={pending[s.id] || 0}
              selected={selected.has(s.id)}
              onToggleSelect={() => toggleSelect(s.id)}
              onOpen={() => onOpen(s.id)}
              onTagClick={(tag) => setTagFilter(tag)}
            />
          ))}
        </div>
      )}

      {creating && (
        <StudentCreateModal
          existingTags={allTags}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            reload();
            onOpen(id);
          }}
        />
      )}

      {bulkOpen && (
        <BulkTagModal
          ids={Array.from(selected)}
          existingTags={allTags}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            reload();
          }}
        />
      )}
    </div>
  );
}

function TagChip({
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

function StudentRow({
  student,
  pending,
  selected,
  onToggleSelect,
  onOpen,
  onTagClick,
}: {
  student: Student;
  pending: number;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onTagClick: (tag: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const atRisk = (student.engagement_score || 0) < 35 && student.onboarded;

  return (
    <Card
      className={`flex items-center gap-3 p-4 transition hover:border-brand-300 ${
        selected ? "border-brand-400 bg-brand-50/40" : ""
      }`}
    >
      <button
        onClick={onToggleSelect}
        data-testid={`select-${student.id}`}
        className="shrink-0 text-ink-muted hover:text-brand-600"
        title="Select for bulk tagging"
      >
        {selected ? (
          <CheckSquare size={18} className="text-brand-600" />
        ) : (
          <Square size={18} />
        )}
      </button>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
          {student.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-bold text-ink">{student.name}</h3>
            {pending > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                <Inbox size={11} /> {pending} to review
              </span>
            )}
            {atRisk && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                <AlertTriangle size={11} /> At risk
              </span>
            )}
            {student.status === "preparing" && (
              <Badge tone="amber">Preparing</Badge>
            )}
          </div>
          <p className="truncate text-xs text-ink-muted">
            {student.grade || "-"}{" · "}Goal {student.target_score}
          </p>
          {(student.tags || []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(student.tags || []).map((tag) => (
                <span
                  key={tag}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick(tag);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 hover:bg-brand-100"
                >
                  <Tag size={9} /> {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      <button
        onClick={() => {
          navigator.clipboard?.writeText(student.access_code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="hidden items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-brand-50 sm:inline-flex"
        title="Copy access code"
      >
        <KeyRound size={13} /> {student.access_code}
        {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      </button>

      <div className="w-28 shrink-0">
        <UsageMeter studentId={student.id} compact />
      </div>

      <button onClick={onOpen} className="shrink-0 text-ink-muted hover:text-brand-600">
        <ChevronRight size={20} />
      </button>
    </Card>
  );
}

function StudentCreateModal({
  existingTags,
  onClose,
  onSaved,
}: {
  existingTags: string[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    access_code: "",
    grade: "11th grade",
    target_score: 1400,
    notes: "",
  });
  // Weak areas are now a real multi-select (chips) instead of a comma string.
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  // One click: AI fills everything except the name with a realistic profile.
  async function autoFill() {
    setAutoFilling(true);
    try {
      const res = await adminFetch("/api/ai/suggest-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name }),
      });
      const d = await res.json();
      const p = d.profile;
      if (p) {
        setForm((f) => ({
          ...f,
          access_code: p.access_code || f.access_code,
          grade: GRADE_OPTIONS.includes(p.grade) ? p.grade : f.grade,
          target_score: p.target_score || f.target_score,
        }));
        if (Array.isArray(p.weak_areas)) setWeakAreas(p.weak_areas);
        if (p.cohort_tag && !tags.includes(p.cohort_tag)) {
          setTags((t) => [...t, p.cohort_tag]);
        }
      }
    } finally {
      setAutoFilling(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await adminFetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags,
          weak_areas: weakAreas,
        }),
      });
      const d = await res.json();
      if (d.student?.id) onSaved(d.student.id);
      else onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New student" onClose={onClose}>
      <div className="space-y-3">
        {/* Name + prominent AI auto-fill */}
        <Field label="Name">
          <div className="flex gap-2">
            <Input
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              className="flex-1"
            />
            <button
              type="button"
              onClick={autoFill}
              disabled={autoFilling || !form.name}
              title="Auto-fill the rest of this form with a realistic profile"
              data-testid="auto-fill"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {autoFilling ? <Spinner className="text-white" /> : <Sparkles size={15} />}
              Auto-fill
            </button>
          </div>
          {!form.name && (
            <p className="mt-1 text-xs text-ink-muted">
              Type a name, then Auto-fill to suggest everything else.
            </p>
          )}
        </Field>

        <Field
          label="Access code (what the student types to log in)"
          action={
            <AIButton
              label="Suggest"
              title="Suggest an access code from the name"
              onRun={async () => {
                const res = await adminFetch("/api/ai/suggest-code", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: form.name }),
                });
                const d = await res.json();
                if (d.code) setForm((f) => ({ ...f, access_code: d.code }));
              }}
            />
          }
        >
          <Input
            value={form.access_code}
            onChange={(v) => setForm({ ...form, access_code: v.toUpperCase() })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grade">
            <Select
              value={form.grade}
              onChange={(v) => setForm({ ...form, grade: v })}
              options={GRADE_OPTIONS.map((g) => ({ value: g, label: g }))}
            />
          </Field>
          <Field label="Target score">
            <Select
              value={String(form.target_score)}
              onChange={(v) => setForm({ ...form, target_score: Number(v) })}
              options={TARGET_OPTIONS.map((t) => ({
                value: String(t),
                label: String(t),
              }))}
            />
          </Field>
        </div>

        <Field label="Weak areas (tap to select)">
          <MultiChipSelect selected={weakAreas} setSelected={setWeakAreas} />
        </Field>

        <Field label="Cohort tags (group students who start together)">
          <TagEditor tags={tags} setTags={setTags} suggestions={existingTags} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !form.name || !form.access_code}>
            {saving ? <Spinner /> : null} Create & open
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Grouped, tap-to-toggle chips for the official SAT skills. Replaces the old
// comma-separated free-text input so picking weak areas is fast and consistent.
function MultiChipSelect({
  selected,
  setSelected,
}: {
  selected: string[];
  setSelected: (v: string[]) => void;
}) {
  function toggle(item: string) {
    setSelected(
      selected.includes(item)
        ? selected.filter((s) => s !== item)
        : [...selected, item]
    );
  }
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-paper/40 p-3">
      {WEAK_AREA_GROUPS.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {g.group}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((item) => {
              const on = selected.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  data-testid={`weak-${item}`}
                  onClick={() => toggle(item)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    on
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-line bg-white text-ink hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {selected.length > 0 && (
        <p className="pt-0.5 text-[11px] text-ink-muted">
          {selected.length} selected
        </p>
      )}
    </div>
  );
}

/* ============================ Settings ============================ */

function SettingsView({ prompts, reload }: { prompts: Prompt[]; reload: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function save(id: string) {
    await adminFetch("/api/prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content: drafts[id] }),
    });
    setSaved(id);
    setTimeout(() => setSaved(null), 1500);
    reload();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-ink">Settings</h1>
      <p className="mt-0.5 text-sm text-ink-muted">
        Control how lessons are written across all students.
      </p>

      <h2 className="mt-6 text-sm font-bold text-ink">Lesson style</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Use placeholders like{" "}
        <code className="rounded bg-paper px-1">{"{{student_name}}"}</code>,{" "}
        <code className="rounded bg-paper px-1">{"{{topic}}"}</code>,{" "}
        <code className="rounded bg-paper px-1">{"{{weak_areas}}"}</code>.
      </p>

      <div className="mt-4 space-y-4">
        {prompts.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{p.label}</h3>
              <div className="flex items-center gap-2">
                <AIButton
                  label="Improve"
                  title="Refine this style"
                  onRun={async () => {
                    const current = drafts[p.id] ?? p.content;
                    const res = await adminFetch("/api/ai/improve", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        text: current,
                        action: "improve",
                        context:
                          "a system/user prompt template for an SAT lesson generator; keep all {{placeholders}} intact",
                      }),
                    });
                    const d = await res.json();
                    if (d.text) setDrafts((dr) => ({ ...dr, [p.id]: d.text }));
                  }}
                />
                <Badge tone="slate">{p.id}</Badge>
              </div>
            </div>
            <Textarea
              value={drafts[p.id] ?? p.content}
              onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))}
              rows={10}
              className="mt-3 font-mono text-xs"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              {saved === p.id && (
                <span className="text-sm font-medium text-green-600">Saved ✓</span>
              )}
              <Button onClick={() => save(p.id)}>Save prompt</Button>
            </div>
          </Card>
        ))}
        {prompts.length === 0 && (
          <Card className="p-8 text-center text-sm text-ink-muted">
            No lesson-style prompts configured.
          </Card>
        )}
      </div>
    </div>
  );
}

/* ============================ shared bits ============================ */

function Field({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-soft">{label}</span>
        {action}
      </span>
      {children}
    </label>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-pop animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-bold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ============================ Tag editor + bulk tag ============================ */

// A small chip-style tag input with suggestions from existing cohort tags.
function TagEditor({
  tags,
  setTags,
  suggestions,
}: {
  tags: string[];
  setTags: (t: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (!t || t.length > 40 || tags.includes(t)) {
      setDraft("");
      return;
    }
    setTags([...tags, t]);
    setDraft("");
  }
  function remove(t: string) {
    setTags(tags.filter((x) => x !== t));
  }
  // Toggle a suggestion on/off so the button always stays visible and gives
  // clear feedback instead of vanishing once used.
  function toggle(t: string) {
    if (tags.includes(t)) remove(t);
    else add(t);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white p-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700"
          >
            {t}
            <button
              onClick={() => remove(t)}
              className="text-brand-400 hover:text-brand-700"
              aria-label={`Remove ${t}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length ? "Add another..." : "e.g. Spring Cohort"}
          data-testid="tag-input"
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-muted">Existing:</span>
          {suggestions.map((s) => {
            const on = tags.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  on
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-line bg-paper text-ink-soft hover:bg-brand-50 hover:text-brand-700"
                }`}
              >
                {on ? <Check size={11} /> : <Plus size={11} />} {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Bulk-apply a tag to several selected students at once.
function BulkTagModal({
  ids,
  existingTags,
  onClose,
  onDone,
}: {
  ids: string[];
  existingTags: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"add" | "remove">("add");

  async function apply() {
    if (tags.length === 0) return;
    setSaving(true);
    try {
      await adminFetch("/api/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "add" ? { ids, add: tags } : { ids, remove: tags }
        ),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Tag ${ids.length} student${ids.length === 1 ? "" : "s"}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Group students who start together into a cohort. Add or remove tags for
          all selected students at once.
        </p>
        <div className="inline-flex rounded-lg border border-line bg-paper p-0.5">
          <button
            onClick={() => setMode("add")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "add" ? "bg-brand-600 text-white" : "text-ink-soft"
            }`}
          >
            Add tags
          </button>
          <button
            onClick={() => setMode("remove")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mode === "remove" ? "bg-brand-600 text-white" : "text-ink-soft"
            }`}
          >
            Remove tags
          </button>
        </div>
        <Field label={mode === "add" ? "Tags to add" : "Tags to remove"}>
          <TagEditor tags={tags} setTags={setTags} suggestions={existingTags} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={saving || tags.length === 0} data-testid="apply-bulk-tag">
            {saving ? <Spinner /> : null}{" "}
            {mode === "add" ? "Add to selected" : "Remove from selected"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

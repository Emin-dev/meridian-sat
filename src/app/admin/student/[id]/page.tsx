"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Logo,
  Button,
  Card,
  Input,
  Textarea,
  Select,
  Badge,
  Spinner,
  AIButton,
  Sparkle,
} from "@/components/ui";
import LessonEditor from "@/components/LessonEditor";
import AdminReview from "@/components/AdminReview";
import AdminTools from "@/components/AdminTools";
import AdminInsights from "@/components/AdminInsights";
import RichMedia from "@/components/RichMedia";
import UsageMeter from "@/components/UsageMeter";
import type { Lesson, Student } from "@/lib/supabase";
import { adminFetch, restoreAdminSession, getAdminToken } from "@/lib/adminClient";
import { DecorMediaProvider, DecorMedia } from "@/components/DecorMedia";
import {
  ArrowLeft,
  BookOpen,
  Wand2,
  Clapperboard,
  LineChart,
  UserCog,
  KeyRound,
  Copy,
  Check,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Shield,
} from "lucide-react";

type Tab = "lessons" | "tools" | "media" | "progress" | "profile";

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id);

  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [tab, setTab] = useState<Tab>("lessons");
  const [editing, setEditing] = useState<Lesson | null>(null);

  async function loadStudent() {
    const [sRes, lRes] = await Promise.all([
      adminFetch(`/api/students/${id}`).then((r) => r.json()),
      adminFetch(`/api/lessons?studentId=${id}`).then((r) => r.json()),
    ]);
    setStudent(sRes.student || null);
    setLessons(lRes.lessons || []);
  }

  useEffect(() => {
    // Verify admin session. The in-memory token is set at login on /admin and
    // persists across client-side navigation. On a hard refresh it's lost, so we
    // first try to restore it from the httpOnly session cookie; only if that
    // fails do we bounce back to /admin.
    (async () => {
      await restoreAdminSession();
      const r = await adminFetch("/api/students");
      if (r.ok) {
        setAuthed(true);
        await loadStudent();
      } else {
        router.replace("/admin");
      }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner />
      </main>
    );
  }

  if (!authed) return null;

  if (!student) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
        <p className="text-ink-muted">Student not found.</p>
        <Button onClick={() => router.push("/admin")}>
          <ArrowLeft size={16} /> Back to students
        </Button>
      </main>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "lessons", label: "Lessons & plan", icon: <BookOpen size={16} /> },
    { id: "tools", label: "AI tools", icon: <Wand2 size={16} /> },
    { id: "media", label: "Rich media", icon: <Clapperboard size={16} /> },
    { id: "progress", label: "Progress", icon: <LineChart size={16} /> },
    { id: "profile", label: "Profile & access", icon: <UserCog size={16} /> },
  ];

  // Decorative header banner per tab (admin can hide app-wide via hover delete).
  const TAB_DECOR: Record<Tab, { key: string; src: string; label: string }> = {
    lessons: { key: "tab-lessons", src: "/decor/tab-lessons.webp", label: "Lessons & plan" },
    tools: { key: "tab-ai-tools", src: "/decor/tab-ai-tools.webp", label: "AI tools" },
    media: { key: "tab-rich-media", src: "/decor/tab-rich-media.webp", label: "Rich media" },
    progress: { key: "tab-progress", src: "/decor/tab-progress.webp", label: "Progress" },
    profile: { key: "tab-profile", src: "/decor/tab-profile.webp", label: "Profile & access" },
  };
  const decor = TAB_DECOR[tab];

  return (
    <DecorMediaProvider
      role="admin"
      authHeaders={() => {
        const t = getAdminToken();
        const h: Record<string, string> = {};
        if (t) h["x-admin-token"] = t;
        return h;
      }}
    >
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <button
            onClick={() => router.push("/admin")}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink"
          >
            <ArrowLeft size={16} /> All students
          </button>
          <Logo />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-6">
        {/* student header */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">
            {student.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{student.name}</h1>
              {student.status === "preparing" && <Badge tone="amber">Preparing</Badge>}
              {student.status === "active" && <Badge tone="brand">Active</Badge>}
            </div>
            <p className="text-sm text-ink-muted">
              {student.grade || "—"} · Goal {student.target_score}
            </p>
          </div>
          <div className="w-full sm:w-64">
            <UsageMeter studentId={student.id} />
          </div>
        </div>

        {/* sub-tabs */}
        <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === t.id ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-paper"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Decorative tab header banner (admin-only hover delete = app-wide hide) */}
        <DecorMedia
          mediaKey={decor.key}
          kind="image"
          src={decor.src}
          alt={decor.label}
          aspect="aspect-[16/4]"
          label={decor.label}
          className="mt-6 border border-line shadow-card"
        />

        <div className="mt-6">
          {tab === "lessons" && (
            <LessonsAndPlan
              student={student}
              lessons={lessons}
              onEdit={setEditing}
              reload={loadStudent}
            />
          )}
          {tab === "tools" && (
            <AdminTools students={[student]} studentId={student.id} reload={loadStudent} />
          )}
          {tab === "media" && <RichMedia student={student} />}
          {tab === "progress" && (
            <AdminInsights students={[student]} reload={loadStudent} />
          )}
          {tab === "profile" && (
            <ProfileAndAccess student={student} reload={loadStudent} />
          )}
        </div>
      </div>

      {editing && (
        <LessonEditor
          lesson={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await adminFetch(`/api/lessons/${editing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
            setEditing(null);
            loadStudent();
          }}
        />
      )}
    </main>
    </DecorMediaProvider>
  );
}

/* ============================ Lessons & plan ============================ */

function LessonsAndPlan({
  student,
  lessons,
  onEdit,
  reload,
}: {
  student: Student;
  lessons: Lesson[];
  onEdit: (l: Lesson) => void;
  reload: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* pending review for this student */}
      <AdminReview studentId={student.id} reload={reload} />

      {/* generate a new lesson for this student */}
      <GenerateLesson student={student} reload={reload} />

      {/* existing lessons */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">
          Lessons ({lessons.length})
        </h3>
        {lessons.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-muted">
            No lessons yet. Generate one above.
          </Card>
        ) : (
          <div className="space-y-2">
            {lessons.map((l) => (
              <Card key={l.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={l.section === "Math" ? "brand" : "amber"}>{l.section}</Badge>
                    <Badge tone="slate">{l.difficulty}</Badge>
                    {l.status === "draft" && <Badge tone="amber">Draft</Badge>}
                  </div>
                  <h4 className="mt-1.5 truncate font-semibold text-ink">{l.title}</h4>
                  <p className="text-xs text-ink-muted">
                    {l.questions?.length || 0} questions
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="soft" onClick={() => onEdit(l)}>
                    <Pencil size={15} /> Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      if (!confirm("Delete this lesson?")) return;
                      await adminFetch(`/api/lessons/${l.id}`, { method: "DELETE" });
                      reload();
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GenerateLesson({ student, reload }: { student: Student; reload: () => void }) {
  const [section, setSection] = useState("Math");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [ideas, setIdeas] = useState<string[]>([]);

  async function generate() {
    setLoading(true);
    setMsg("");
    setErr("");
    try {
      const res = await adminFetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, section, topic, difficulty }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Generation failed.");
        return;
      }
      setMsg(`Created “${d.lesson.title}”.`);
      setTopic("");
      reload();
    } catch {
      setErr("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h3 className="text-sm font-bold text-ink">Create a new lesson</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Section</span>
          <Select
            value={section}
            onChange={setSection}
            options={[
              { value: "Math", label: "Math" },
              { value: "Reading and Writing", label: "Reading and Writing" },
            ]}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Difficulty</span>
          <Select
            value={difficulty}
            onChange={setDifficulty}
            options={[
              { value: "easy", label: "Easy" },
              { value: "medium", label: "Medium" },
              { value: "hard", label: "Hard" },
            ]}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-ink-soft">Topic</span>
          <AIButton
            label="Suggest topics"
            title="Suggest relevant SAT topics"
            onRun={async () => {
              const res = await adminFetch("/api/ai/suggest-topics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ studentId: student.id, section }),
              });
              const d = await res.json();
              setIdeas(d.topics || []);
            }}
          />
        </span>
        <Input
          value={topic}
          onChange={setTopic}
          placeholder="e.g. Linear equations, Command of evidence…"
        />
        {ideas.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ideas.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                <Sparkle className="text-brand-500" /> {t}
              </button>
            ))}
          </div>
        )}
      </label>

      {err && <p className="text-sm font-medium text-red-600">{err}</p>}
      {msg && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          {msg}
        </p>
      )}

      <Button onClick={generate} disabled={loading || !topic.trim()} className="w-full">
        {loading ? (
          <>
            <Spinner /> Creating lesson…
          </>
        ) : (
          <>
            <Sparkles size={16} /> Create lesson
          </>
        )}
      </Button>
      {loading && (
        <p className="text-center text-xs text-ink-muted">
          This can take 15–40 seconds. Please wait.
        </p>
      )}
    </Card>
  );
}

/* ============================ Profile & access ============================ */

function ProfileAndAccess({ student, reload }: { student: Student; reload: () => void }) {
  const [form, setForm] = useState({
    name: student.name,
    access_code: student.access_code,
    grade: student.grade || "",
    target_score: student.target_score,
    weak_areas: Array.isArray(student.weak_areas) ? student.weak_areas.join(", ") : "",
    tags: Array.isArray(student.tags) ? student.tags.join(", ") : "",
    notes: student.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [grant, setGrant] = useState(50);
  const [granting, setGranting] = useState(false);
  const [meterKey, setMeterKey] = useState(0);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await adminFetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          weak_areas: form.weak_areas
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          tags: form.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function grantBonus() {
    setGranting(true);
    try {
      await adminFetch("/api/ai-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, grant }),
      });
      setMeterKey((k) => k + 1);
    } finally {
      setGranting(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${student.name} and all their data?`)) return;
    await adminFetch(`/api/students/${student.id}`, { method: "DELETE" });
    router.push("/admin");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="space-y-3 p-5 lg:col-span-2">
        <h3 className="text-sm font-bold text-ink">Profile</h3>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Name</span>
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Access code</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(form.access_code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} Copy
            </button>
          </span>
          <Input
            value={form.access_code}
            onChange={(v) => setForm({ ...form, access_code: v.toUpperCase() })}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Grade</span>
            <Input value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-ink-soft">Target score</span>
            <Input
              type="number"
              value={form.target_score}
              onChange={(v) => setForm({ ...form, target_score: Number(v) })}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
            Weak areas (comma-separated)
          </span>
          <Input
            value={form.weak_areas}
            onChange={(v) => setForm({ ...form, weak_areas: v })}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
            Cohort tags (comma-separated)
          </span>
          <Input
            value={form.tags}
            onChange={(v) => setForm({ ...form, tags: v })}
          />
          {form.tags.trim() && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {form.tags
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
                  >
                    {t}
                  </span>
                ))}
            </div>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-ink-soft">Private notes (admin only)</span>
            <div className="flex gap-1.5">
              <AIButton
                label="Auto-write"
                title="Auto-write a progress note from lessons & scores"
                onRun={async () => {
                  const res = await adminFetch("/api/ai/summarize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ studentId: student.id }),
                  });
                  const d = await res.json();
                  if (d.summary) setForm((f) => ({ ...f, notes: d.summary }));
                }}
              />
              {form.notes.trim() && (
                <AIButton
                  label="Improve"
                  title="Polish this note"
                  onRun={async () => {
                    const res = await adminFetch("/api/ai/improve", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        text: form.notes,
                        action: "improve",
                        context: "private tutor note about an SAT student",
                      }),
                    });
                    const d = await res.json();
                    if (d.text) setForm((f) => ({ ...f, notes: d.text }));
                  }}
                />
              )}
            </div>
          </span>
          <Textarea
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
            rows={3}
          />
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="danger" onClick={remove}>
            <Trash2 size={15} /> Delete student
          </Button>
          <div className="flex items-center gap-2">
            {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
            <Button onClick={save} disabled={saving || !form.name || !form.access_code}>
              {saving ? <Spinner /> : null} Save profile
            </Button>
          </div>
        </div>
      </Card>

      {/* usage & access */}
      <div className="space-y-4">
        <UsageMeter studentId={student.id} refreshKey={meterKey} />
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Shield size={15} /> Grant extra requests
          </h3>
          <p className="text-xs text-ink-muted">
            Add bonus AI requests for today. Raises every threshold and clears any block.
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(grant)}
              onChange={(v) => setGrant(Number(v))}
              options={[
                { value: "25", label: "+25" },
                { value: "50", label: "+50" },
                { value: "100", label: "+100" },
                { value: "200", label: "+200" },
              ]}
            />
            <Button onClick={grantBonus} disabled={granting}>
              {granting ? <Spinner /> : <Plus size={15} />} Grant
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

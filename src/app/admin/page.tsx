"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Button, Card, Input, Textarea, Select, Badge, Spinner } from "@/components/ui";
import LessonEditor from "@/components/LessonEditor";
import type { Lesson, Student, Progress, Prompt } from "@/lib/supabase";
import {
  Users,
  BookOpen,
  Sparkles,
  BarChart3,
  Bot,
  Plus,
  Pencil,
  Trash2,
  Home,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";

type Tab = "students" | "lessons" | "generate" | "analytics" | "prompts";

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("students");

  // data
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [editing, setEditing] = useState<Lesson | null>(null);

  async function login() {
    setAuthLoading(true);
    setAuthErr("");
    try {
      const res = await fetch("/api/admin-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
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

  async function loadAll() {
    const [s, l, p, pr] = await Promise.all([
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/lessons").then((r) => r.json()),
      fetch("/api/progress").then((r) => r.json()),
      fetch("/api/prompts").then((r) => r.json()),
    ]);
    setStudents(s.students || []);
    setLessons(l.lessons || []);
    setProgress(p.progress || []);
    setPrompts(pr.prompts || []);
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
            <Input
              type="password"
              value={pw}
              onChange={setPw}
              placeholder="Admin password"
            />
            {authErr && <p className="text-sm font-medium text-red-600">{authErr}</p>}
            <Button onClick={login} disabled={authLoading} className="w-full">
              {authLoading ? <Spinner /> : <KeyRound size={16} />} Sign in
            </Button>
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "students", label: "Students", icon: <Users size={17} /> },
    { id: "lessons", label: "Lessons", icon: <BookOpen size={17} /> },
    { id: "generate", label: "Generate", icon: <Sparkles size={17} /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 size={17} /> },
    { id: "prompts", label: "AI Prompts", icon: <Bot size={17} /> },
  ];

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="brand">Admin</Badge>
          </div>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
          >
            <Home size={16} /> Exit
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* tab nav */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-brand-600 text-white"
                  : "text-ink-soft hover:bg-paper"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {tab === "students" && (
            <StudentsTab students={students} reload={loadAll} />
          )}
          {tab === "lessons" && (
            <LessonsTab
              lessons={lessons}
              students={students}
              onEdit={setEditing}
              reload={loadAll}
            />
          )}
          {tab === "generate" && (
            <GenerateTab students={students} reload={loadAll} setTab={setTab} />
          )}
          {tab === "analytics" && (
            <AnalyticsTab
              students={students}
              lessons={lessons}
              progress={progress}
            />
          )}
          {tab === "prompts" && (
            <PromptsTab prompts={prompts} reload={loadAll} />
          )}
        </div>
      </div>

      {editing && (
        <LessonEditor
          lesson={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await fetch(`/api/lessons/${editing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
            setEditing(null);
            loadAll();
          }}
        />
      )}
    </main>
  );
}

/* ---------------- Students ---------------- */
function StudentsTab({
  students,
  reload,
}: {
  students: Student[];
  reload: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Student> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function blank(): Partial<Student> {
    return {
      name: "",
      access_code: "",
      grade: "11th grade",
      target_score: 1400,
      weak_areas: [],
      notes: "",
    };
  }

  async function save() {
    if (!editing) return;
    const body = {
      ...editing,
      weak_areas:
        typeof editing.weak_areas === "string"
          ? (editing.weak_areas as string).split(",").map((s) => s.trim()).filter(Boolean)
          : editing.weak_areas,
    };
    if (editing.id) {
      await fetch(`/api/students/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Delete this student and all their lessons?")) return;
    await fetch(`/api/students/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Students</h2>
        <Button onClick={() => setEditing(blank())}>
          <Plus size={16} /> New student
        </Button>
      </div>

      {students.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-ink-muted">
          No students yet. Create your first student to get started.
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-ink">{s.name}</h3>
                  <p className="text-xs text-ink-muted">{s.grade}</p>
                </div>
                <Badge tone="brand">Goal {s.target_score}</Badge>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(s.access_code);
                  setCopied(s.id);
                  setTimeout(() => setCopied(null), 1500);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-sm font-semibold tracking-wide text-ink-soft hover:bg-brand-50"
              >
                <KeyRound size={14} /> {s.access_code}
                {copied === s.id ? (
                  <Check size={14} className="text-green-600" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
              {s.weak_areas?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {s.weak_areas.map((w) => (
                    <Badge key={w} tone="amber">
                      {w}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(s)}>
                  <Pencil size={15} /> Edit
                </Button>
                <Button variant="danger" onClick={() => remove(s.id)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit student" : "New student"} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Name">
              <Input
                value={editing.name || ""}
                onChange={(v) => setEditing({ ...editing, name: v })}
              />
            </Field>
            <Field label="Access code (what the student types to log in)">
              <Input
                value={editing.access_code || ""}
                onChange={(v) => setEditing({ ...editing, access_code: v.toUpperCase() })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Grade">
                <Input
                  value={editing.grade || ""}
                  onChange={(v) => setEditing({ ...editing, grade: v })}
                />
              </Field>
              <Field label="Target score">
                <Input
                  type="number"
                  value={editing.target_score ?? 1400}
                  onChange={(v) => setEditing({ ...editing, target_score: Number(v) })}
                />
              </Field>
            </div>
            <Field label="Weak areas (comma-separated)">
              <Input
                value={
                  Array.isArray(editing.weak_areas)
                    ? editing.weak_areas.join(", ")
                    : (editing.weak_areas as any) || ""
                }
                onChange={(v) => setEditing({ ...editing, weak_areas: v as any })}
              />
            </Field>
            <Field label="Private notes (admin only)">
              <Textarea
                value={editing.notes || ""}
                onChange={(v) => setEditing({ ...editing, notes: v })}
                rows={3}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!editing.name || !editing.access_code}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Lessons ---------------- */
function LessonsTab({
  lessons,
  students,
  onEdit,
  reload,
}: {
  lessons: Lesson[];
  students: Student[];
  onEdit: (l: Lesson) => void;
  reload: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const name = (id: string) => students.find((s) => s.id === id)?.name || "—";
  const shown =
    filter === "all" ? lessons : lessons.filter((l) => l.student_id === filter);

  async function remove(id: string) {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">All lessons</h2>
        <div className="w-56">
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All students" },
              ...students.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-ink-muted">
          No lessons yet. Use the Generate tab to create AI lessons.
        </Card>
      ) : (
        <div className="mt-4 space-y-2">
          {shown.map((l) => (
            <Card key={l.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={l.section === "Math" ? "brand" : "amber"}>
                    {l.section}
                  </Badge>
                  <Badge tone="slate">{l.difficulty}</Badge>
                  {l.status === "draft" && <Badge tone="amber">Draft</Badge>}
                </div>
                <h3 className="mt-1.5 truncate font-semibold text-ink">{l.title}</h3>
                <p className="text-xs text-ink-muted">
                  {name(l.student_id)} · {l.questions?.length || 0} questions
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="soft" onClick={() => onEdit(l)}>
                  <Pencil size={15} /> Edit
                </Button>
                <Button variant="danger" onClick={() => remove(l.id)}>
                  <Trash2 size={15} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Generate ---------------- */
function GenerateTab({
  students,
  reload,
  setTab,
}: {
  students: Student[];
  reload: () => void;
  setTab: (t: Tab) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [section, setSection] = useState("Math");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function generate() {
    setLoading(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, section, topic, difficulty }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Generation failed.");
        return;
      }
      setMsg(`Created “${d.lesson.title}”. Find it in the Lessons tab to review or edit.`);
      setTopic("");
      reload();
    } catch {
      setErr("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold text-ink">Generate a lesson with AI</h2>
      <p className="mt-1 text-sm text-ink-muted">
        DeepSeek V4 Pro creates a personalized lesson, practice questions, and a
        study plan. You can edit everything afterward.
      </p>

      <Card className="mt-4 space-y-4 p-6">
        <Field label="Student">
          <Select
            value={studentId}
            onChange={setStudentId}
            options={[
              { value: "", label: "Select a student…" },
              ...students.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Section">
            <Select
              value={section}
              onChange={setSection}
              options={[
                { value: "Math", label: "Math" },
                { value: "Reading and Writing", label: "Reading and Writing" },
              ]}
            />
          </Field>
          <Field label="Difficulty">
            <Select
              value={difficulty}
              onChange={setDifficulty}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </Field>
        </div>
        <Field label="Topic">
          <Input
            value={topic}
            onChange={setTopic}
            placeholder="e.g. Linear equations, Command of evidence…"
          />
        </Field>

        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        {msg && (
          <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            {msg}
          </p>
        )}

        <Button
          onClick={generate}
          disabled={loading || !studentId || !topic.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Spinner /> Generating with DeepSeek…
            </>
          ) : (
            <>
              <Sparkles size={16} /> Generate lesson
            </>
          )}
        </Button>
        {loading && (
          <p className="text-center text-xs text-ink-muted">
            This can take 15–40 seconds. Please wait.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Analytics ---------------- */
function AnalyticsTab({
  students,
  lessons,
  progress,
}: {
  students: Student[];
  lessons: Lesson[];
  progress: Progress[];
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-ink">Progress & analytics</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="Students" value={students.length} />
        <KPI label="Lessons" value={lessons.length} />
        <KPI label="Completions" value={progress.filter((p) => p.completed).length} />
        <KPI
          label="Avg score"
          value={
            progress.filter((p) => p.score != null).length
              ? Math.round(
                  progress.reduce((a, p) => a + (p.score || 0), 0) /
                    progress.filter((p) => p.score != null).length
                ) + "%"
              : "—"
          }
        />
      </div>

      <Card className="mt-5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Lessons done</th>
              <th className="px-4 py-3">Avg score</th>
              <th className="px-4 py-3">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.map((s) => {
              const mine = progress.filter((p) => p.student_id === s.id);
              const done = mine.filter((p) => p.completed).length;
              const scored = mine.filter((p) => p.score != null);
              const avg = scored.length
                ? Math.round(
                    scored.reduce((a, p) => a + (p.score || 0), 0) / scored.length
                  )
                : null;
              return (
                <tr key={s.id} className="text-ink-soft">
                  <td className="px-4 py-3 font-semibold text-ink">{s.name}</td>
                  <td className="px-4 py-3">{done}</td>
                  <td className="px-4 py-3">{avg != null ? `${avg}%` : "—"}</td>
                  <td className="px-4 py-3">{s.target_score}</td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ---------------- Prompts ---------------- */
function PromptsTab({
  prompts,
  reload,
}: {
  prompts: Prompt[];
  reload: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  async function save(id: string) {
    await fetch("/api/prompts", {
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
      <h2 className="text-lg font-bold text-ink">AI prompts</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Control exactly how the AI writes lessons. Use placeholders like{" "}
        <code className="rounded bg-paper px-1">{"{{student_name}}"}</code>,{" "}
        <code className="rounded bg-paper px-1">{"{{topic}}"}</code>,{" "}
        <code className="rounded bg-paper px-1">{"{{weak_areas}}"}</code>.
      </p>

      <div className="mt-4 space-y-4">
        {prompts.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">{p.label}</h3>
              <Badge tone="slate">{p.id}</Badge>
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
      </div>
    </div>
  );
}

/* ---------------- shared bits ---------------- */
function KPI({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{label}</span>
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

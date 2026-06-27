"use client";

import { useEffect, useState } from "react";
import { Card, Button, Badge, Spinner, Select } from "@/components/ui";
import type { Student, StudentTool } from "@/lib/supabase";
import {
  Check,
  X,
  Sparkles,
  Wand2,
  Timer,
  BookOpen,
  Calculator,
  Flame,
  RotateCcw,
  Heart,
  Trophy,
  Glasses,
  type LucideIcon,
} from "lucide-react";

// Map the catalog icon slugs to lucide components.
const ICONS: Record<string, LucideIcon> = {
  timer: Timer,
  "book-open": BookOpen,
  calculator: Calculator,
  flame: Flame,
  "rotate-ccw": RotateCcw,
  heart: Heart,
  trophy: Trophy,
  glasses: Glasses,
  sparkles: Sparkles,
};

type ToolWithStudent = StudentTool & {
  students?: { name: string; access_code: string; status: string } | null;
};

/**
 * The teacher's control room for per-student adaptive tools. The helper
 * proposes new tools based on each student's usage; nothing reaches a student
 * until the teacher approves it here.
 */
export default function AdminTools({
  students,
  reload,
  studentId,
}: {
  students: Student[];
  reload?: () => void;
  // When set, the tool control room is scoped to a single student.
  studentId?: string;
}) {
  const [tools, setTools] = useState<ToolWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposeFor, setProposeFor] = useState(studentId || "");
  const [proposing, setProposing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/student-tools").then((r) => r.json());
      const all = d.tools || [];
      setTools(studentId ? all.filter((t: any) => t.student_id === studentId) : all);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (studentId) setProposeFor(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function propose() {
    if (!proposeFor) return;
    setProposing(true);
    setNote("");
    try {
      const d = await fetch("/api/ai/propose-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: proposeFor }),
      }).then((r) => r.json());
      if (d.proposed?.length) {
        setNote(`Proposed ${d.proposed.length} tool(s) — review below.`);
      } else {
        setNote(d.message || "No new tools to propose for this student right now.");
      }
      await load();
    } catch {
      setNote("Couldn't generate proposals — try again.");
    } finally {
      setProposing(false);
    }
  }

  async function act(id: string, action: "approve" | "deny") {
    setBusy(id);
    try {
      await fetch(`/api/student-tools/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
      reload?.();
    } finally {
      setBusy(null);
    }
  }

  const pending = tools.filter((t) => t.status === "pending");
  const approved = tools.filter((t) => t.status === "approved");
  const nameOf = (t: ToolWithStudent) =>
    t.students?.name || students.find((s) => s.id === t.student_id)?.name || "Student";

  return (
    <div className="space-y-6">
      {/* Propose new tools for a student */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Wand2 size={17} />
          </span>
          <div>
            <h3 className="font-bold text-ink">Personalize a student's workspace</h3>
            <p className="text-sm text-ink-muted">
              Suggest new tools based on how a student actually studies. You approve
              before anything appears for them.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!studentId && (
            <div className="min-w-[220px] flex-1">
              <Select
                value={proposeFor}
                onChange={setProposeFor}
                options={[
                  { value: "", label: "Choose a student…" },
                  ...students.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          )}
          <Button onClick={propose} disabled={!proposeFor || proposing}>
            {proposing ? (
              <>
                <Spinner className="h-4 w-4" /> Thinking…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Suggest tools
              </>
            )}
          </Button>
        </div>
        {note && <p className="mt-3 text-sm font-medium text-brand-700">{note}</p>}
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6 text-brand-600" />
        </div>
      ) : (
        <>
          {/* Pending approvals */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
              Waiting for your approval
              {pending.length ? ` (${pending.length})` : ""}
            </h3>
            {pending.length === 0 ? (
              <Card className="mt-3 p-8 text-center text-sm text-ink-muted">
                Nothing waiting. Use “Suggest tools” above to personalize a student.
              </Card>
            ) : (
              <div className="mt-3 grid gap-3">
                {pending.map((t) => {
                  const Icon = ICONS[t.icon] || Sparkles;
                  return (
                    <Card key={t.id} className="p-5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-ink">{t.title}</h4>
                            <Badge tone="slate">{t.kind}</Badge>
                            <Badge tone="brand">for {nameOf(t)}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-ink-soft">{t.description}</p>
                          {t.rationale && (
                            <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-sm text-ink-muted">
                              <span className="font-semibold text-ink-soft">Why: </span>
                              {t.rationale}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <Button
                            onClick={() => act(t.id, "approve")}
                            disabled={busy === t.id}
                          >
                            <Check size={16} /> Approve
                          </Button>
                          <button
                            onClick={() => act(t.id, "deny")}
                            disabled={busy === t.id}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-paper"
                          >
                            <X size={16} /> Dismiss
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active tools */}
          {approved.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                Active for students ({approved.length})
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {approved.map((t) => {
                  const Icon = ICONS[t.icon] || Sparkles;
                  return (
                    <Card key={t.id} className="flex items-center gap-3 p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-700">
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{t.title}</p>
                        <p className="text-xs text-ink-muted">for {nameOf(t)}</p>
                      </div>
                      <button
                        onClick={() => act(t.id, "deny")}
                        disabled={busy === t.id}
                        className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-paper"
                      >
                        Turn off
                      </button>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

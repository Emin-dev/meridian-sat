"use client";

import { useEffect, useState } from "react";
import { Button, Card, Badge, Spinner, Textarea } from "@/components/ui";
import Markdown from "@/components/Markdown";
import type { LessonRequest } from "@/lib/supabase";
import {
  Check,
  X,
  RefreshCw,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Send,
} from "lucide-react";

type ReqWithStudent = LessonRequest & {
  students?: { name: string; access_code: string; status: string };
};

// Admin review queue: pending personalized lesson packages waiting for the
// teacher to approve, refine, or send back for a better version.
export default function AdminReview({ reload }: { reload: () => void }) {
  const [requests, setRequests] = useState<ReqWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/lesson-requests?status=pending");
    const data = await res.json();
    setRequests(data.requests || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16 text-brand-600">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Lessons to review</h2>
          <p className="mt-1 text-sm text-ink-muted">
            New personalized lesson plans waiting for your approval before they
            reach the student.
          </p>
        </div>
        <Button variant="ghost" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-ink-muted">
          Nothing to review right now. New requests appear here when a student
          finishes their sign-up.
        </Card>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((r) => (
            <ReviewCard
              key={r.id}
              request={r}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              onDone={() => {
                load();
                reload();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  request,
  open,
  onToggle,
  onDone,
}: {
  request: ReqWithStudent;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [chat, setChat] = useState<{ role: string; content: string }[]>(
    Array.isArray(request.discussion) ? request.discussion : []
  );
  const [chatMsg, setChatMsg] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function act(action: string, body: Record<string, any> = {}) {
    setBusy(action);
    try {
      const res = await fetch(`/api/lesson-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const d = await res.json();
      if (!res.ok) {
        alert(d.error || "Something went wrong.");
        return;
      }
      onDone();
    } finally {
      setBusy("");
    }
  }

  async function sendChat() {
    if (!chatMsg.trim()) return;
    setChatBusy(true);
    const mine = chatMsg.trim();
    setChat((c) => [...c, { role: "teacher", content: mine }]);
    setChatMsg("");
    try {
      const res = await fetch(`/api/lesson-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discuss", message: mine }),
      });
      const d = await res.json();
      if (d.reply) setChat((c) => [...c, { role: "assistant", content: d.reply }]);
    } finally {
      setChatBusy(false);
    }
  }

  const lessons = Array.isArray(request.lessons) ? request.lessons : [];

  return (
    <Card className="overflow-hidden">
      {/* header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-ink">{request.students?.name}</h3>
            <Badge tone="amber">
              <Clock size={11} className="mr-1 inline" /> Awaiting review
            </Badge>
            {request.version > 1 && (
              <Badge tone="slate">v{request.version}</Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-ink-muted">
            {lessons.length} lessons · {request.ai_summary || "Personalized plan"}
          </p>
        </div>
        {open ? (
          <ChevronDown size={18} className="shrink-0 text-ink-muted" />
        ) : (
          <ChevronRight size={18} className="shrink-0 text-ink-muted" />
        )}
      </button>

      {open && (
        <div className="border-t border-line p-5">
          {/* tutor note */}
          {request.notes && (
            <div className="mb-4 rounded-xl bg-paper p-3 text-sm text-ink-soft">
              <span className="font-semibold text-ink">Note: </span>
              {request.notes}
            </div>
          )}

          {/* study plan */}
          <details className="mb-4 rounded-xl border border-line p-4" open>
            <summary className="cursor-pointer font-semibold text-ink">
              Study plan
            </summary>
            <div className="mt-3 border-t border-line pt-3">
              <Markdown>{request.study_plan || "_No plan_"}</Markdown>
            </div>
          </details>

          {/* lessons */}
          <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-muted">
            Lessons ({lessons.length})
          </h4>
          <div className="space-y-2">
            {lessons.map((l: any, i: number) => (
              <details key={i} className="rounded-xl border border-line p-4">
                <summary className="cursor-pointer">
                  <span className="font-semibold text-ink">{l.title}</span>{" "}
                  <Badge tone={l.section === "Math" ? "brand" : "amber"}>
                    {l.section}
                  </Badge>{" "}
                  <Badge tone="slate">{l.difficulty}</Badge>{" "}
                  <span className="text-xs text-ink-muted">
                    {l.questions?.length || 0} questions
                  </span>
                </summary>
                <div className="mt-3 border-t border-line pt-3">
                  <Markdown>{l.content}</Markdown>
                </div>
              </details>
            ))}
          </div>

          {/* discuss with assistant */}
          <div className="mt-5 rounded-xl border border-line">
            <button
              onClick={() => setShowFeedback((v) => v)}
              className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold text-ink"
            >
              <MessageSquare size={15} className="text-brand-600" />
              Discuss & refine
            </button>
            <div className="max-h-60 space-y-2 overflow-y-auto p-4">
              {chat.length === 0 && (
                <p className="text-xs text-ink-muted">
                  Ask for changes in plain language — e.g. “make lesson 2 harder”
                  or “add a lesson on geometry”.
                </p>
              )}
              {chat.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    m.role === "teacher"
                      ? "ml-8 bg-brand-50 text-ink"
                      : "mr-8 bg-paper text-ink-soft"
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {chatBusy && (
                <div className="mr-8 inline-flex items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm text-ink-muted">
                  <Spinner className="h-4 w-4" /> Thinking…
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-line p-3">
              <input
                value={chatMsg}
                onChange={(e) => setChatMsg(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Ask for a change…"
                className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
              <Button onClick={sendChat} disabled={chatBusy || !chatMsg.trim()}>
                <Send size={15} />
              </Button>
            </div>
          </div>

          {/* feedback for regenerate */}
          <div className="mt-4">
            <Textarea
              value={feedback}
              onChange={setFeedback}
              rows={2}
              placeholder="Optional: what should be improved if you send this back? (leave blank for a fresh new version)"
            />
          </div>

          {/* actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => act("approve")}
              disabled={!!busy}
              className="flex-1"
            >
              {busy === "approve" ? (
                <Spinner />
              ) : (
                <Check size={16} />
              )}
              Approve & send to student
            </Button>
            <Button
              variant="ghost"
              onClick={() => act("deny", { feedback })}
              disabled={!!busy}
            >
              {busy === "deny" ? <Spinner /> : <X size={15} />}
              Send back & rebuild
            </Button>
          </div>
          {busy === "deny" && (
            <p className="mt-2 text-center text-xs text-ink-muted">
              Building an improved version… this can take 15–40 seconds.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

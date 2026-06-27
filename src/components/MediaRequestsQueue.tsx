"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Spinner } from "@/components/ui";
import {
  ImageIcon,
  Mic,
  Clapperboard,
  Youtube,
  Check,
  X,
  CheckCheck,
  Inbox,
} from "lucide-react";
import { adminFetch } from "@/lib/adminClient";

type MediaRequest = {
  id: string;
  kind: string;
  topic: string;
  note: string;
  status: "pending" | "approved" | "denied" | "fulfilled";
  created_at: string;
};

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={14} />,
  podcast: <Mic size={14} />,
  video: <Clapperboard size={14} />,
  youtube: <Youtube size={14} />,
};

const KIND_LABEL: Record<string, string> = {
  image: "Image",
  podcast: "Audio",
  video: "Video",
  youtube: "YouTube",
};

/**
 * Admin review queue for student media requests, scoped to one student. Shown at
 * the top of that student's Rich-media studio so the teacher sees exactly what
 * the student asked for and can act on it. Media is NEVER auto-created: the
 * teacher approves, denies, or (after creating it below) marks it fulfilled.
 */
export default function MediaRequestsQueue({ studentId }: { studentId: string }) {
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await adminFetch(`/api/media-requests?studentId=${studentId}`);
      const d = await r.json();
      setRequests(d.requests || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function act(id: string, action: "approve" | "deny" | "fulfill") {
    setBusyId(id);
    try {
      await adminFetch(`/api/media-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Only show requests that still need attention.
  const open = requests.filter((r) => r.status === "pending" || r.status === "approved");

  if (loading) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-ink-muted">
        <Spinner className="h-4 w-4" /> Checking media requests…
      </Card>
    );
  }

  if (open.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50 p-4" data-testid="media-requests-queue">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Inbox size={15} />
        </span>
        <h4 className="text-sm font-bold text-ink">
          Media requests from this student ({open.length})
        </h4>
      </div>

      <div className="space-y-2">
        {open.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3 sm:flex-row sm:items-center"
            data-testid={`media-request-${r.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge tone="slate">
                  <span className="inline-flex items-center gap-1">
                    {KIND_ICON[r.kind]} {KIND_LABEL[r.kind] || r.kind}
                  </span>
                </Badge>
                {r.status === "approved" && <Badge tone="brand">Approved</Badge>}
              </div>
              <p className="mt-1 text-sm font-medium text-ink">{r.topic}</p>
              {r.note && <p className="mt-0.5 text-xs text-ink-muted">{r.note}</p>}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {r.status === "pending" && (
                <>
                  <button
                    onClick={() => act(r.id, "approve")}
                    disabled={busyId === r.id}
                    data-testid={`approve-request-${r.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    onClick={() => act(r.id, "deny")}
                    disabled={busyId === r.id}
                    data-testid={`deny-request-${r.id}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                  >
                    <X size={13} /> Deny
                  </button>
                </>
              )}
              {r.status === "approved" && (
                <button
                  onClick={() => act(r.id, "fulfill")}
                  disabled={busyId === r.id}
                  data-testid={`fulfill-request-${r.id}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-100 disabled:opacity-50"
                  title="Mark as done after you've created the media below"
                >
                  <CheckCheck size={13} /> Mark created
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Approve a request, then create the media using the tools below. When it's
        ready, choose “Mark created” to clear it from the student's pending list.
      </p>
    </Card>
  );
}

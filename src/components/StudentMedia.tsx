"use client";

import { useEffect, useState } from "react";
import { Card, Badge, Spinner } from "@/components/ui";
import {
  ImageIcon,
  Mic,
  Clapperboard,
  Youtube,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  X,
} from "lucide-react";
import { studentFetch } from "@/lib/studentClient";

type MediaAsset = {
  id: string;
  kind: "image" | "podcast" | "video" | "youtube";
  title: string;
  url: string;
  thumbnail_url: string;
  created_at: string;
};

type MediaRequest = {
  id: string;
  kind: string;
  topic: string;
  status: "pending" | "approved" | "denied" | "fulfilled";
  created_at: string;
};

const KINDS = [
  { value: "image", label: "Image / diagram" },
  { value: "podcast", label: "Audio overview" },
  { value: "video", label: "Video overview" },
  { value: "youtube", label: "Video clips" },
];

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={15} />,
  podcast: <Mic size={15} />,
  video: <Clapperboard size={15} />,
  youtube: <Youtube size={15} />,
};

/**
 * Student-facing media panel. Students can VIEW media a teacher has created for
 * them, and can REQUEST a new piece of media. Nothing is generated here — a
 * request goes to the teacher's review queue. The teacher decides whether to
 * create it. This keeps the school in control of every asset.
 */
export default function StudentMedia({ studentId }: { studentId: string }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [requests, setRequests] = useState<MediaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [kind, setKind] = useState("image");
  const [topic, setTopic] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [aRes, rRes] = await Promise.all([
        studentFetch(`/api/media?studentId=${studentId}`).then((r) => r.json()),
        studentFetch(`/api/media-requests?studentId=${studentId}`).then((r) => r.json()),
      ]);
      setAssets(aRes.assets || []);
      setRequests(rRes.requests || []);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function submit() {
    if (!topic.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await studentFetch("/api/media-requests", {
        method: "POST",
        body: JSON.stringify({ studentId, kind, topic: topic.trim(), note: note.trim() }),
      });
      if (r.ok) {
        setTopic("");
        setNote("");
        setShowForm(false);
        setJustSent(true);
        setTimeout(() => setJustSent(false), 4000);
        load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const pending = requests.filter((r) => r.status === "pending" || r.status === "approved");
  const fieldCls =
    "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-400";

  return (
    <section aria-labelledby="media-heading">
      <div className="mt-9 flex items-center justify-between gap-3">
        <h2 id="media-heading" className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Your media
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          data-testid="button-toggle-media-request"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
        >
          {showForm ? (
            <>
              <X size={15} /> Cancel
            </>
          ) : (
            <>
              <Plus size={15} /> Request media
            </>
          )}
        </button>
      </div>

      {justSent && (
        <Card className="mt-3 flex items-center gap-2 border-green-200 bg-green-50/70 p-3 animate-fadeUp">
          <CheckCircle2 size={16} className="text-green-600" />
          <p className="text-sm font-medium text-green-700">
            Request sent. Your tutor will review it and create it for you.
          </p>
        </Card>
      )}

      {/* request form */}
      {showForm && (
        <Card className="mt-3 space-y-3 p-4 animate-fadeUp">
          <div>
            <label
              htmlFor="media-kind"
              className="mb-1 block text-xs font-semibold text-ink-muted"
            >
              What kind of media?
            </label>
            <select
              id="media-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              data-testid="select-media-kind"
              className={fieldCls}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="media-topic"
              className="mb-1 block text-xs font-semibold text-ink-muted"
            >
              What should it be about?
            </label>
            <input
              id="media-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. A diagram of how to factor quadratics"
              data-testid="input-media-topic"
              className={fieldCls}
            />
          </div>
          <div>
            <label
              htmlFor="media-note"
              className="mb-1 block text-xs font-semibold text-ink-muted"
            >
              Anything else? (optional)
            </label>
            <textarea
              id="media-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add any detail that would help your tutor."
              rows={2}
              data-testid="input-media-note"
              className={fieldCls}
            />
          </div>
          <button
            onClick={submit}
            disabled={!topic.trim() || submitting}
            data-testid="button-submit-media-request"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Spinner /> : <Plus size={15} />} Send request
          </button>
        </Card>
      )}

      {/* pending/approved requests */}
      {pending.length > 0 && (
        <div className="mt-3 space-y-2">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
              data-testid={`request-${r.id}`}
            >
              <span className="text-ink-muted">{KIND_ICON[r.kind]}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{r.topic}</span>
              {r.status === "approved" ? (
                <Badge tone="brand">Approved</Badge>
              ) : (
                <Badge tone="amber">Pending</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* media library */}
      {loading ? (
        <Card className="mt-3 flex items-center justify-center p-10">
          <Spinner />
        </Card>
      ) : assets.length === 0 ? (
        <Card className="mt-3 p-8 text-center">
          <ImageIcon className="mx-auto text-brand-300" size={34} />
          <p className="mt-3 font-semibold text-ink">No media yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Ask your tutor for a diagram, audio overview, or video using “Request media”.
          </p>
        </Card>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a, i) => (
            <Card key={a.id} className="overflow-hidden p-0">
              <div
                data-testid={`asset-${a.id}`}
                className="animate-cardIn"
                style={{ ["--i" as string]: i }}
              >
                {a.kind === "image" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.title}
                    width={1024}
                    height={576}
                    loading={i < 3 ? "eager" : "lazy"}
                    decoding="async"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="aspect-video w-full bg-brand-50 object-cover"
                  />
                ) : a.kind === "video" && a.url ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={a.url}
                    poster={a.thumbnail_url || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full bg-black object-cover"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center bg-brand-50 text-brand-400">
                    {a.kind === "podcast" ? (
                      <Mic size={28} />
                    ) : a.kind === "video" ? (
                      <Clapperboard size={28} />
                    ) : (
                      <Youtube size={28} />
                    )}
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-muted">{KIND_ICON[a.kind]}</span>
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {a.title || "Untitled"}
                    </p>
                  </div>
                  {a.kind === "podcast" && a.url && (
                    <audio controls src={a.url} className="mt-2 w-full" />
                  )}
                  {a.kind === "youtube" && a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
                    >
                      <Play size={14} /> Watch
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

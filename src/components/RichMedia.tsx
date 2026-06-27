"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Button, Badge, Spinner, Input, Select } from "@/components/ui";
import type { Student } from "@/lib/supabase";
import {
  ImageIcon,
  Mic,
  Clapperboard,
  Youtube,
  Sparkles,
  Trash2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  Download,
} from "lucide-react";
import { adminFetch } from "@/lib/adminClient";
import MediaRequestsQueue from "@/components/MediaRequestsQueue";

type MediaAsset = {
  id: string;
  student_id: string;
  lesson_id: string | null;
  kind: "image" | "podcast" | "video" | "youtube";
  title: string;
  prompt: string;
  url: string;
  thumbnail_url: string;
  meta: any;
  created_at: string;
};

type Tool = "image" | "podcast" | "video" | "youtube";

const SECTIONS = [
  { value: "Math", label: "Math" },
  { value: "Reading and Writing", label: "Reading and Writing" },
];

/**
 * The NotebookLM-style media studio for one student. Lives inside the student
 * detail page. The teacher generates images, audio overviews, video overviews
 * and curated YouTube clips — all stored to the student's media library.
 */
export default function RichMedia({ student }: { student: Student }) {
  const [tool, setTool] = useState<Tool>("image");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await adminFetch(`/api/media?studentId=${student.id}`);
      const d = await r.json();
      setAssets(d.assets || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  async function remove(id: string) {
    if (!confirm("Delete this media item?")) return;
    await adminFetch(`/api/media?id=${id}`, { method: "DELETE" });
    setAssets((a) => a.filter((x) => x.id !== id));
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: "image", label: "Images & diagrams", icon: <ImageIcon size={16} />, hint: "Free" },
    { id: "podcast", label: "Podcast", icon: <Mic size={16} />, hint: "Audio overview" },
    { id: "video", label: "Video overview", icon: <Clapperboard size={16} />, hint: "Narrated slides" },
    { id: "youtube", label: "YouTube", icon: <Youtube size={16} />, hint: "Curated clips" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-ink">Rich media studio</h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          Create lesson media for {student.name} — images, audio overviews, narrated videos and
          curated YouTube clips.
        </p>
      </div>

      {/* Student-initiated requests waiting on the teacher (never auto-created) */}
      <MediaRequestsQueue studentId={student.id} />

      {/* tool switcher */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
              tool === t.id
                ? "border-brand-400 bg-brand-50"
                : "border-line bg-white hover:bg-paper"
            }`}
          >
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                tool === t.id ? "text-brand-700" : "text-ink"
              }`}
            >
              {t.icon} {t.label}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">{t.hint}</span>
          </button>
        ))}
      </div>

      {/* generator panel */}
      {tool === "image" && <ImageTool student={student} onDone={load} />}
      {tool === "podcast" && <PodcastTool student={student} onDone={load} />}
      {tool === "video" && <VideoTool student={student} onDone={load} />}
      {tool === "youtube" && <YouTubeTool student={student} onDone={load} />}

      {/* library */}
      <div>
        <h4 className="mb-2 text-sm font-bold text-ink">Media library</h4>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="h-4 w-4" /> Loading…
          </div>
        ) : assets.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-muted">
            No media yet. Generate your first item above.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} onDelete={() => remove(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ generators ============================ */

function PanelCard({ children }: { children: React.ReactNode }) {
  return <Card className="space-y-3 p-5">{children}</Card>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold text-ink-soft">{children}</span>;
}

function ErrMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{msg}</p>
  );
}

/* ---- images ---- */
function ImageTool({ student, onDone }: { student: Student; onDone: () => void }) {
  const [topic, setTopic] = useState("");
  const [section, setSection] = useState("Math");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/api/media/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, topic, section, prompt }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setTopic("");
      setPrompt("");
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard>
      <div>
        <Label>Topic</Label>
        <Input value={topic} onChange={setTopic} placeholder="e.g. The unit circle, Comma rules…" />
      </div>
      <div>
        <Label>Section</Label>
        <Select value={section} onChange={setSection} options={SECTIONS} />
      </div>
      <div>
        <Label>Custom prompt (optional — overrides topic)</Label>
        <Input
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe the exact diagram you want…"
        />
      </div>
      <ErrMsg msg={err} />
      <Button onClick={go} disabled={busy || (!topic.trim() && !prompt.trim())} className="w-full">
        {busy ? (
          <>
            <Spinner /> Generating diagram…
          </>
        ) : (
          <>
            <Sparkles size={16} /> Generate diagram
          </>
        )}
      </Button>
      <p className="text-center text-[11px] text-ink-muted">Free · powered by Pollinations</p>
    </PanelCard>
  );
}

/* ---- podcast ---- */
function PodcastTool({ student, onDone }: { student: Student; onDone: () => void }) {
  const [topic, setTopic] = useState("");
  const [section, setSection] = useState("Math");
  const [script, setScript] = useState<{ title: string; summary: string; turns: any[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"" | "script" | "audio">("");
  const [err, setErr] = useState("");
  const [needsKey, setNeedsKey] = useState(false);

  async function writeScript() {
    setBusy(true);
    setStage("script");
    setErr("");
    setNeedsKey(false);
    try {
      const r = await adminFetch("/api/media/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, topic, section, scriptOnly: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setScript(d.script);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  async function makeAudio() {
    if (!script) return;
    setBusy(true);
    setStage("audio");
    setErr("");
    try {
      const r = await adminFetch("/api/media/podcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          topic,
          section,
          turns: script.turns,
          title: script.title,
          summary: script.summary,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsKey) setNeedsKey(true);
        throw new Error(d.error || "Failed");
      }
      setScript(null);
      setTopic("");
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <PanelCard>
      <div>
        <Label>Topic</Label>
        <Input value={topic} onChange={setTopic} placeholder="e.g. Linear equations word problems" />
      </div>
      <div>
        <Label>Section</Label>
        <Select value={section} onChange={setSection} options={SECTIONS} />
      </div>

      {!script && (
        <Button onClick={writeScript} disabled={busy || !topic.trim()} className="w-full">
          {busy && stage === "script" ? (
            <>
              <Spinner /> Writing 2-host script…
            </>
          ) : (
            <>
              <Sparkles size={16} /> Write podcast script
            </>
          )}
        </Button>
      )}

      {script && (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-paper p-3">
            <p className="text-sm font-bold text-ink">{script.title}</p>
            <p className="text-xs text-ink-muted">{script.summary}</p>
            <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
              {script.turns.map((t, i) => (
                <p key={i} className="text-xs leading-relaxed text-ink-soft">
                  <span
                    className={`font-bold ${
                      t.speaker === "Host A" ? "text-brand-600" : "text-amber-600"
                    }`}
                  >
                    {t.speaker}:
                  </span>{" "}
                  {t.text}
                </p>
              ))}
            </div>
          </div>
          <ErrMsg msg={err} />
          {needsKey && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              Audio needs a Gemini API key in Vercel. The script is ready — add the key, then click
              “Create audio.”
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setScript(null)} disabled={busy}>
              <X size={15} /> Discard
            </Button>
            <Button onClick={makeAudio} disabled={busy} className="flex-1">
              {busy && stage === "audio" ? (
                <>
                  <Spinner /> Recording audio…
                </>
              ) : (
                <>
                  <Mic size={16} /> Create audio
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      {!script && <ErrMsg msg={err} />}
      <p className="text-center text-[11px] text-ink-muted">
        Two AI hosts · powered by DeepSeek + Gemini TTS
      </p>
    </PanelCard>
  );
}

/* ---- video overview ---- */
function VideoTool({ student, onDone }: { student: Student; onDone: () => void }) {
  const [topic, setTopic] = useState("");
  const [section, setSection] = useState("Math");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function go() {
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await adminFetch("/api/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, topic, section }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      if (d.needsKey) setNote("Created without narration — add a Gemini key in Vercel for voice-over.");
      setTopic("");
      onDone();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard>
      <div>
        <Label>Topic</Label>
        <Input value={topic} onChange={setTopic} placeholder="e.g. How to attack reading passages" />
      </div>
      <div>
        <Label>Section</Label>
        <Select value={section} onChange={setSection} options={SECTIONS} />
      </div>
      <ErrMsg msg={err} />
      {note && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{note}</p>
      )}
      <Button onClick={go} disabled={busy || !topic.trim()} className="w-full">
        {busy ? (
          <>
            <Spinner /> Building video overview… (up to a minute)
          </>
        ) : (
          <>
            <Clapperboard size={16} /> Create video overview
          </>
        )}
      </Button>
      <p className="text-center text-[11px] text-ink-muted">
        Narrated slideshow · DeepSeek + diagrams + voice-over
      </p>
    </PanelCard>
  );
}

/* ---- youtube ---- */
function YouTubeTool({ student, onDone }: { student: Student; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch(`/api/media/youtube?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setResults(d.results || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(video: any) {
    await adminFetch("/api/media/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, video }),
    });
    setSaved(video.url);
    setTimeout(() => setSaved(null), 1500);
    onDone();
  }

  return (
    <PanelCard>
      <div>
        <Label>Search YouTube for a lesson topic</Label>
        <div className="flex gap-2">
          <Input value={q} onChange={setQ} placeholder="e.g. SAT quadratic equations" />
          <Button onClick={search} disabled={busy || !q.trim()}>
            {busy ? <Spinner /> : <Search size={16} />}
          </Button>
        </div>
      </div>
      <ErrMsg msg={err} />
      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((v) => (
            <div
              key={v.url}
              className="flex items-center gap-3 rounded-xl border border-line p-2.5"
            >
              {v.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.thumbnail}
                  alt=""
                  className="h-12 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-paper">
                  <Youtube size={20} className="text-ink-muted" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-xs font-semibold text-ink hover:text-brand-600"
                >
                  {v.title}
                </a>
                <p className="text-[11px] text-ink-muted">{v.channel}</p>
              </div>
              {v.videoId ? (
                <Button variant="soft" onClick={() => save(v)}>
                  {saved === v.url ? "Saved ✓" : <Plus size={15} />}
                </Button>
              ) : (
                <a href={v.url} target="_blank" rel="noreferrer">
                  <Button variant="ghost">Open</Button>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-ink-muted">
        Curate trusted clips for {student.name}
      </p>
    </PanelCard>
  );
}

/* ============================ asset cards ============================ */

function AssetCard({ asset, onDelete }: { asset: MediaAsset; onDelete: () => void }) {
  return (
    <Card className="overflow-hidden">
      {asset.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.title} className="aspect-video w-full object-cover" />
      )}
      {asset.kind === "podcast" && <PodcastCard asset={asset} />}
      {asset.kind === "video" && <VideoCard asset={asset} />}
      {asset.kind === "youtube" && <YouTubeCard asset={asset} />}

      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <KindBadge kind={asset.kind} />
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-ink">{asset.title}</p>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </Card>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    image: { tone: "brand", label: "Diagram" },
    podcast: { tone: "amber", label: "Podcast" },
    video: { tone: "brand", label: "Video" },
    youtube: { tone: "slate", label: "YouTube" },
  };
  const m = map[kind] || map.image;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function PodcastCard({ asset }: { asset: MediaAsset }) {
  return (
    <div className="bg-gradient-to-br from-amber-50 to-brand-50 p-4">
      <p className="mb-2 line-clamp-2 text-xs text-ink-soft">{asset.meta?.summary || ""}</p>
      <audio controls src={asset.url} className="w-full" />
    </div>
  );
}

function YouTubeCard({ asset }: { asset: MediaAsset }) {
  const id = asset.meta?.videoId;
  if (id) {
    return (
      <div className="aspect-video w-full">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${id}`}
          title={asset.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <a href={asset.url} target="_blank" rel="noreferrer" className="block">
      {asset.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.thumbnail_url} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-paper">
          <Youtube size={28} className="text-red-500" />
        </div>
      )}
    </a>
  );
}

/* ---- in-browser video-overview player ---- */
function VideoCard({ asset }: { asset: MediaAsset }) {
  const slides: any[] = asset.meta?.slides || [];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const slide = slides[i];
  const hasAudio = slides.some((s) => s.audioUrl);

  useEffect(() => {
    // When playing, auto-advance when this slide's audio ends.
    const el = audioRef.current;
    if (!el) return;
    function onEnd() {
      if (i < slides.length - 1) {
        setI((x) => x + 1);
      } else {
        setPlaying(false);
      }
    }
    el.addEventListener("ended", onEnd);
    return () => el.removeEventListener("ended", onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, slides.length]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, i]);

  if (slides.length === 0) {
    return (
      <div className="flex aspect-video items-center justify-center bg-paper text-xs text-ink-muted">
        No slides
      </div>
    );
  }

  return (
    <div className="bg-ink">
      <div className="relative aspect-video w-full overflow-hidden bg-ink">
        {slide?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.url} alt={slide.heading} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
            {slide?.heading}
          </div>
        )}
        {/* caption overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-3">
          <p className="text-xs font-bold text-white">{slide?.heading}</p>
          {slide?.bullets?.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {slide.bullets.map((b: string, k: number) => (
                <li key={k} className="text-[11px] text-white/85">
                  • {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center gap-2 bg-ink px-3 py-2">
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          disabled={i === 0}
          className="rounded-lg p-1 text-white/80 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronLeft size={16} />
        </button>
        {hasAudio ? (
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg bg-white/15 p-1.5 text-white hover:bg-white/25"
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        ) : null}
        <button
          onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}
          disabled={i === slides.length - 1}
          className="rounded-lg p-1 text-white/80 hover:bg-white/10 disabled:opacity-30"
        >
          <ChevronRight size={16} />
        </button>
        <span className="ml-auto text-[11px] font-medium text-white/70">
          {i + 1} / {slides.length}
        </span>
      </div>
      {slide?.audioUrl && (
        <audio ref={audioRef} src={slide.audioUrl} preload="auto" className="hidden" />
      )}
    </div>
  );
}

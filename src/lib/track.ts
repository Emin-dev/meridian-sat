"use client";

// ---------------------------------------------------------------------------
// Client-side activity tracking
// ---------------------------------------------------------------------------
// A tiny, dependency-free helper that batches activity events and POSTs them to
// /api/events. It is designed to be invisible and cheap:
//   - events are queued in memory and flushed on a short interval / on page hide
//   - NO localStorage / cookies (sandbox + this app's URL-param auth pattern)
//   - time-on-task timers measure how long a student actually spends reading a
//     lesson, doing practice, or sitting on a screen.
//
// Usage:
//   const t = createTracker(studentId);
//   t.track("lesson_open", { lessonId });
//   const stop = t.startTimer("reading_tick", { lessonId });  // call stop() later
//   t.flush();  // force send
// ---------------------------------------------------------------------------

export type TrackEvent = {
  type: string;
  lessonId?: string | null;
  meta?: Record<string, any>;
  durationMs?: number;
};

type QueuedEvent = TrackEvent & { _ts: number };

const FLUSH_INTERVAL_MS = 8000;
const MAX_QUEUE = 25;

export type Tracker = {
  track: (type: string, opts?: Omit<TrackEvent, "type">) => void;
  startTimer: (type: string, opts?: Omit<TrackEvent, "type" | "durationMs">) => () => void;
  flush: () => void;
  dispose: () => void;
};

export function createTracker(studentId: string): Tracker {
  let queue: QueuedEvent[] = [];
  let interval: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  function enqueue(ev: TrackEvent) {
    if (!studentId || disposed) return;
    queue.push({ ...ev, _ts: Date.now() });
    if (queue.length >= MAX_QUEUE) flush();
  }

  function flush(useBeacon = false) {
    if (!studentId || queue.length === 0) return;
    const batch = queue.map(({ _ts, ...e }) => e);
    queue = [];
    const payload = JSON.stringify({ studentId, batch });

    // sendBeacon survives page unload; fall back to fetch keepalive.
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          "/api/events",
          new Blob([payload], { type: "application/json" })
        );
        return;
      } catch {
        /* fall through to fetch */
      }
    }
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* tracking is best-effort; never surface errors to the student */
    });
  }

  function track(type: string, opts: Omit<TrackEvent, "type"> = {}) {
    enqueue({ type, ...opts });
  }

  // Returns a stop() function that logs elapsed time when called.
  function startTimer(
    type: string,
    opts: Omit<TrackEvent, "type" | "durationMs"> = {}
  ) {
    const start = Date.now();
    let stopped = false;
    return function stop(extraMeta?: Record<string, any>) {
      if (stopped) return;
      stopped = true;
      const durationMs = Date.now() - start;
      // Ignore trivial blips (< 1s) to keep the log clean.
      if (durationMs < 1000) return;
      enqueue({
        type,
        durationMs,
        lessonId: opts.lessonId,
        meta: { ...(opts.meta || {}), ...(extraMeta || {}) },
      });
    };
  }

  // Periodic + on-hide flush.
  if (typeof window !== "undefined") {
    interval = setInterval(() => flush(), FLUSH_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => flush(true));
    // store remover on the closure via dispose
    (track as any)._cleanup = () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }

  function dispose() {
    disposed = true;
    flush(true);
    if (interval) clearInterval(interval);
    if ((track as any)._cleanup) (track as any)._cleanup();
  }

  return { track, startTimer, flush: () => flush(false), dispose };
}

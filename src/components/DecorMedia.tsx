"use client";

/**
 * Decorative media + login-gated hide/restore controls (additive feature).
 *
 * Two pieces:
 *   - <DecorMediaProvider> wraps a page (or subtree). It fetches the current
 *     hidden state once from /api/ui-media and exposes helpers to read & toggle
 *     visibility. It also carries the VIEWER context so children know who can
 *     hide what:
 *        role 'guest'   → no controls (not logged in)
 *        role 'student' → can hide media for THEIR OWN view (scope='student')
 *        role 'admin'   → can hide media APP-WIDE for everyone (scope='global')
 *   - <DecorMedia> renders one piece of media (an intro video or an image
 *     banner). When logged in, a low-opacity delete control appears on hover
 *     (top-right). When the media is hidden, it collapses to a small low-opacity
 *     "restore" pill so the action is always reversible.
 *
 * State lives in the DB per-user (never localStorage), so a student's hides
 * follow them across devices and an admin's global hides apply to everyone.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";

type Role = "guest" | "student" | "admin";

type AuthHeaders = Record<string, string>;

type DecorCtx = {
  role: Role;
  studentId: string | null;
  /** Is this media key hidden for the current viewer? */
  isHidden: (key: string) => boolean;
  /** Hide or restore a media key. Picks scope from the viewer's role. */
  setHidden: (key: string, hidden: boolean) => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<DecorCtx | null>(null);

export function DecorMediaProvider({
  role,
  studentId = null,
  authHeaders,
  children,
}: {
  role: Role;
  studentId?: string | null;
  /** Returns the auth headers to attach to write requests (admin/student token). */
  authHeaders?: () => AuthHeaders;
  children: ReactNode;
}) {
  const [globalHidden, setGlobalHidden] = useState<Set<string>>(new Set());
  const [studentHidden, setStudentHidden] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
      const res = await fetch(`/api/ui-media${qs}`);
      if (res.ok) {
        const d = await res.json();
        setGlobalHidden(new Set<string>(d.globalHidden || []));
        setStudentHidden(new Set<string>(d.studentHidden || []));
      }
    } catch {
      /* decorations are non-critical; fail open (show media) */
    } finally {
      setReady(true);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const isHidden = useCallback(
    (key: string) => globalHidden.has(key) || studentHidden.has(key),
    [globalHidden, studentHidden]
  );

  const setHidden = useCallback(
    async (key: string, hidden: boolean) => {
      if (role === "guest") return; // controls never shown to guests anyway

      const scope = role === "admin" ? "global" : "student";

      // Optimistic update.
      if (scope === "global") {
        setGlobalHidden((prev) => {
          const next = new Set(prev);
          hidden ? next.add(key) : next.delete(key);
          return next;
        });
      } else {
        setStudentHidden((prev) => {
          const next = new Set(prev);
          hidden ? next.add(key) : next.delete(key);
          return next;
        });
      }

      try {
        const headers: AuthHeaders = {
          "Content-Type": "application/json",
          ...(authHeaders ? authHeaders() : {}),
        };
        const body: Record<string, unknown> = {
          media_key: key,
          scope,
          hidden,
        };
        if (scope === "student") body.studentId = studentId;
        const res = await fetch("/api/ui-media", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("write failed");
      } catch {
        // Roll back on failure.
        await load();
      }
    },
    [role, studentId, authHeaders, load]
  );

  const value = useMemo<DecorCtx>(
    () => ({ role, studentId, isHidden, setHidden, ready }),
    [role, studentId, isHidden, setHidden, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useDecor(): DecorCtx | null {
  return useContext(Ctx);
}

/** Trash / hide icon. */
function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Restore / eye icon. */
function RestoreIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/**
 * One decorative media block.
 *
 * @param mediaKey   stable key used for hide/restore state (e.g. "intro").
 * @param kind       "video" | "image".
 * @param src        image src OR video poster src.
 * @param sources    for video: [{src, type}] entries.
 * @param alt        accessible label / alt text.
 * @param className  extra classes on the wrapper.
 * @param rounded    border radius utility (defaults to 2xl).
 * @param aspect     aspect-ratio utility class (e.g. "aspect-[16/9]").
 */
export function DecorMedia({
  mediaKey,
  kind,
  src,
  sources,
  alt = "",
  className = "",
  rounded = "rounded-2xl",
  aspect = "aspect-[16/9]",
  label,
}: {
  mediaKey: string;
  kind: "video" | "image";
  src: string;
  sources?: { src: string; type: string }[];
  alt?: string;
  className?: string;
  rounded?: string;
  aspect?: string;
  /** Optional short label shown over the media (e.g. a tab title). */
  label?: string;
}) {
  const ctx = useDecor();
  const hidden = ctx?.isHidden(mediaKey) ?? false;
  const canControl = !!ctx && ctx.role !== "guest";

  // When hidden: render a small, low-opacity restore pill (only for those who
  // can control — guests just see nothing).
  if (hidden) {
    if (!canControl) return null;
    return (
      <div className={`flex ${className}`} data-testid={`decor-hidden-${mediaKey}`}>
        <button
          type="button"
          onClick={() => ctx?.setHidden(mediaKey, false)}
          title={ctx?.role === "admin" ? "Restore for everyone" : "Restore"}
          data-testid={`decor-restore-${mediaKey}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ink-muted opacity-40 transition hover:opacity-100 hover:text-brand-700"
        >
          <RestoreIcon />
          Restore {ctx?.role === "admin" ? "media (all)" : "media"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`group relative overflow-hidden ${rounded} ${className}`}
      data-testid={`decor-${mediaKey}`}
    >
      {kind === "video" ? (
        <video
          className={`block w-full ${aspect} object-cover`}
          autoPlay
          muted
          loop
          playsInline
          poster={src}
          preload="metadata"
          aria-label={alt}
          data-testid={`decor-video-${mediaKey}`}
        >
          {(sources || []).map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className={`block w-full ${aspect} object-cover`}
          data-testid={`decor-img-${mediaKey}`}
        />
      )}

      {label ? (
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <span className="ml-5 text-lg font-bold tracking-tight text-white drop-shadow-sm sm:ml-7 sm:text-xl">
            {label}
          </span>
        </div>
      ) : null}

      {/* Login-gated hide control: low opacity, brightens on hover, top-right. */}
      {canControl ? (
        <button
          type="button"
          onClick={() => ctx?.setHidden(mediaKey, true)}
          title={ctx?.role === "admin" ? "Hide for everyone" : "Hide from my view"}
          data-testid={`decor-hide-${mediaKey}`}
          className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-ink-muted opacity-0 shadow-sm backdrop-blur transition hover:bg-white hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}

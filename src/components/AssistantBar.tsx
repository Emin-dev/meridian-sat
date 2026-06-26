"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, X, Sparkles, ChevronUp } from "lucide-react";

type Action = {
  label: string;
  why: string;
  target: { tab?: string; studentId?: string; action?: string };
};

/**
 * A quiet floating helper for the teacher. It watches which tab they're on and
 * surfaces the 1-3 highest-leverage next moves — review a waiting plan, check on
 * a slipping student, publish drafts. Subtle, dismissible, never shouty. No
 * mention of AI anywhere.
 */
export default function AssistantBar({
  tab,
  onGo,
}: {
  tab: string;
  onGo: (target: { tab?: string; studentId?: string }) => void;
}) {
  const [actions, setActions] = useState<Action[]>([]);
  const [open, setOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const lastTab = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    // Re-read the room whenever the teacher changes tab.
    fetch("/api/ai/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin", tab }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const next: Action[] = d.actions || [];
        setActions(next);
        // Reopen for a genuinely new set of suggestions.
        const key = next.map((a) => a.label).join("|");
        if (key !== dismissedKey) setOpen(true);
        lastTab.current = tab;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (!actions.length || !open) return null;

  const key = actions.map((a) => a.label).join("|");
  const top = actions[0];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-brand-200 bg-white/95 shadow-pop backdrop-blur animate-fadeUp">
        {/* header row */}
        <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-gradient-to-r from-brand-50 to-white px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-white">
              <Sparkles size={13} />
            </span>
            Suggested next steps
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="rounded-md p-1 text-ink-muted transition hover:bg-white hover:text-ink"
              aria-label={collapsed ? "Expand" : "Collapse"}
            >
              <ChevronUp
                size={16}
                className={`transition ${collapsed ? "rotate-180" : ""}`}
              />
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setDismissedKey(key);
              }}
              className="rounded-md p-1 text-ink-muted transition hover:bg-white hover:text-ink"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="divide-y divide-line/60">
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={i}
                onClick={() => {
                  onGo(a.target);
                  setOpen(false);
                  setDismissedKey(key);
                }}
                className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-paper"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {a.label}
                  </span>
                  {a.why && (
                    <span className="block truncate text-xs text-ink-muted">{a.why}</span>
                  )}
                </span>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-brand-600"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

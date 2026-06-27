"use client";

import { ReactNode, useState } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 64 64"
        fill="none"
        aria-label="MeridianSAT logo"
      >
        <rect width="64" height="64" rx="17" fill="#1f4ced" />
        {/* compass: two-tone needle in a bezel ring */}
        <circle cx="32" cy="32" r="20" stroke="white" strokeWidth="2" />
        <path d="M32 14 L37 32 L32 32 Z M32 14 L27 32 L32 32 Z" fill="white" />
        <path
          d="M32 50 L37 32 L32 32 Z M32 50 L27 32 L32 32 Z"
          fill="white"
          opacity="0.55"
        />
        <circle
          cx="32"
          cy="32"
          r="2.6"
          fill="#1f4ced"
          stroke="white"
          strokeWidth="1.4"
        />
      </svg>
      <span className="font-bold tracking-tight text-ink">
        Meridian<span className="text-brand-600">SAT</span>
      </span>
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger" | "soft";
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<string, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-card",
    soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
    ghost: "bg-white text-ink-soft border border-line hover:bg-paper",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-400 ${className}`}
    />
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-400 ${className}`}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand-400 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "green" | "amber" | "slate";
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Small sparkle icon used by all AI helper buttons.
export function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
        fill="currentColor"
      />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

// Reusable "AI ✨" button. Calls the provided async action, shows a spinner,
// and is used throughout the admin for invisible-by-default AI assistance.
export function AIButton({
  onRun,
  label = "AI",
  title,
  className = "",
  disabled,
}: {
  onRun: () => Promise<void>;
  label?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      title={title || "Suggest"}
      disabled={loading || disabled}
      onClick={async () => {
        setLoading(true);
        try {
          await onRun();
        } finally {
          setLoading(false);
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? (
        <Spinner className="text-brand-600" />
      ) : (
        <Sparkle className="text-brand-600" />
      )}
      {label}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

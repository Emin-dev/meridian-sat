import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Per-student daily AI rate limiting.
 *
 * The school owns an unlimited DeepSeek plan, so the goal here is fairness and
 * abuse protection — not cost control. Each student gets a generous daily budget
 * with a soft, tiered ramp instead of a hard wall:
 *
 *   • WARN  (>= 90 requests)  Student + admin both see a gentle heads-up.
 *   • THROTTLE (>= 100)       Still allowed to keep studying, but spaced out:
 *                             one request every THROTTLE_MINUTES (3–5 min).
 *   • BLOCK (>= 200)          Hard stop for this student until the admin grants
 *                             more requests OR 12 hours pass (blocked_until).
 *
 * Admins can lift a student at any time by adding to the `bonus` column, which
 * raises every threshold for that student that day.
 *
 * The counter lives in the `ai_usage` table, keyed UNIQUE(student_id, day) where
 * `day` is the UTC date. A new day rolls the count back to 0 automatically.
 */

export const DAILY_BASE = 100; // soft limit — throttling begins here
export const WARN_AT = 90; // gentle warning threshold
export const THROTTLE_MINUTES = 4; // spacing once throttled (3–5 min window)
export const HARD_BLOCK = 200; // absolute ceiling before a block
export const BLOCK_HOURS = 12; // auto-unblock window

export type RateTier = "ok" | "warn" | "throttle" | "block";

export type RateStatus = {
  /** Whether this request is permitted to proceed right now. */
  allowed: boolean;
  /** Current tier the student is in. */
  tier: RateTier;
  /** Requests used so far today (after this check, if allowed & committed). */
  count: number;
  /** The effective daily soft limit (base + bonus). */
  limit: number;
  /** The effective hard ceiling (HARD_BLOCK + bonus). */
  hardLimit: number;
  /** Admin-granted bonus requests for today. */
  bonus: number;
  /** Seconds the caller must wait before retrying (throttle or block). 0 if none. */
  retryAfter: number;
  /** True when the student should see a "you're nearing your limit" notice. */
  warn: boolean;
  /** Human-readable reason for the current state (shown in UI / API). */
  message: string;
  /** ISO timestamp the student is blocked until, when tier === "block". */
  blockedUntil: string | null;
};

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Route guard for AI endpoints attributed to a specific student.
 *
 * Call at the top of a route. If the student is allowed, returns null and the
 * request has been counted. If not, returns a ready-to-send 429 NextResponse
 * with the rate status in the body and a Retry-After header — the route should
 * `return` it immediately.
 *
 * Pass `commit:false` for a non-consuming pre-check (e.g. to render a meter).
 */
export async function guardStudentAI(
  studentId: string | null | undefined,
  opts: { commit?: boolean } = {}
): Promise<{ blocked: NextResponse | null; status: RateStatus | null }> {
  if (!studentId) return { blocked: null, status: null };
  const status = await checkAndConsume(studentId, opts);
  if (!status.allowed) {
    return {
      blocked: NextResponse.json(
        {
          error: status.message,
          rate: status,
        },
        { status: 429, headers: { "Retry-After": String(status.retryAfter) } }
      ),
      status,
    };
  }
  return { blocked: null, status };
}

/**
 * Read-only peek at a student's current usage for today. Does NOT increment.
 * Use this to render usage meters for both admin and student.
 */
export async function peekUsage(studentId: string): Promise<RateStatus> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("ai_usage")
    .select("count, bonus, last_request_at, blocked_until")
    .eq("student_id", studentId)
    .eq("day", utcDay())
    .maybeSingle();

  const count = data?.count ?? 0;
  const bonus = data?.bonus ?? 0;
  const blockedUntil = data?.blocked_until ?? null;
  return evaluate(count, bonus, data?.last_request_at ?? null, blockedUntil, false);
}

/**
 * Check + (optionally) commit one AI request for a student.
 *
 * When `commit` is true (default) and the request is allowed, the daily counter
 * is incremented atomically and `last_request_at` is stamped. When blocked or
 * throttled, nothing is committed and `allowed` is false with a `retryAfter`.
 *
 * Pass `commit: false` to do a dry-run check without consuming a request.
 */
export async function checkAndConsume(
  studentId: string,
  opts: { commit?: boolean } = {}
): Promise<RateStatus> {
  const commit = opts.commit !== false;
  const supabase = getSupabaseAdmin();
  const day = utcDay();

  // Fetch current row (create lazily on first request of the day).
  const { data: existing } = await supabase
    .from("ai_usage")
    .select("id, count, bonus, last_request_at, blocked_until")
    .eq("student_id", studentId)
    .eq("day", day)
    .maybeSingle();

  const count = existing?.count ?? 0;
  const bonus = existing?.bonus ?? 0;
  const lastAt = existing?.last_request_at ?? null;
  let blockedUntil = existing?.blocked_until ?? null;

  // If a stale block has expired, clear it before evaluating.
  if (blockedUntil && new Date(blockedUntil).getTime() <= Date.now()) {
    blockedUntil = null;
  }

  const status = evaluate(count, bonus, lastAt, blockedUntil, true);

  if (!status.allowed) {
    // If we just crossed into the hard ceiling, persist a block window so the
    // student stays blocked for BLOCK_HOURS (or until admin grants more).
    if (status.tier === "block" && !blockedUntil) {
      const until = new Date(Date.now() + BLOCK_HOURS * 3600 * 1000).toISOString();
      await upsertUsage(supabase, existing?.id, studentId, day, count, bonus, lastAt, until);
      status.blockedUntil = until;
      status.retryAfter = BLOCK_HOURS * 3600;
    }
    return status;
  }

  if (commit) {
    const now = new Date().toISOString();
    const newCount = count + 1;
    await upsertUsage(supabase, existing?.id, studentId, day, newCount, bonus, now, blockedUntil);
    // Re-evaluate with the committed count so the caller sees post-increment tier.
    const after = evaluate(newCount, bonus, now, blockedUntil, true);
    after.allowed = true;
    return after;
  }

  return status;
}

/**
 * Admin action: grant a student extra requests for today. Adds to `bonus`,
 * which raises every threshold, and clears any active block.
 */
export async function grantBonus(studentId: string, amount: number): Promise<RateStatus> {
  const supabase = getSupabaseAdmin();
  const day = utcDay();
  const { data: existing } = await supabase
    .from("ai_usage")
    .select("id, count, bonus, last_request_at")
    .eq("student_id", studentId)
    .eq("day", day)
    .maybeSingle();

  const newBonus = (existing?.bonus ?? 0) + amount;
  await upsertUsage(
    supabase,
    existing?.id,
    studentId,
    day,
    existing?.count ?? 0,
    newBonus,
    existing?.last_request_at ?? null,
    null // clear any block
  );
  return peekUsage(studentId);
}

async function upsertUsage(
  supabase: any,
  id: string | undefined,
  studentId: string,
  day: string,
  count: number,
  bonus: number,
  lastAt: string | null,
  blockedUntil: string | null
) {
  const row = {
    student_id: studentId,
    day,
    count,
    bonus,
    last_request_at: lastAt,
    blocked_until: blockedUntil,
  };
  if (id) {
    await supabase.from("ai_usage").update(row).eq("id", id);
  } else {
    // onConflict on the UNIQUE(student_id, day) constraint handles races.
    await supabase.from("ai_usage").upsert(row, { onConflict: "student_id,day" });
  }
}

/**
 * Pure decision function given the current counters. Separated so it can be
 * unit-reasoned about and reused by both peek and consume paths.
 */
function evaluate(
  count: number,
  bonus: number,
  lastAt: string | null,
  blockedUntil: string | null,
  forRequest: boolean
): RateStatus {
  const limit = DAILY_BASE + bonus;
  const hardLimit = HARD_BLOCK + bonus;
  const warnAt = WARN_AT + bonus;

  const base: RateStatus = {
    allowed: true,
    tier: "ok",
    count,
    limit,
    hardLimit,
    bonus,
    retryAfter: 0,
    warn: false,
    message: "",
    blockedUntil: null,
  };

  // 1) Active hard block.
  if (blockedUntil) {
    const ms = new Date(blockedUntil).getTime() - Date.now();
    if (ms > 0) {
      return {
        ...base,
        allowed: false,
        tier: "block",
        retryAfter: Math.ceil(ms / 1000),
        warn: true,
        blockedUntil,
        message:
          "Daily request limit reached. Ask your teacher to grant more, or come back later.",
      };
    }
  }

  // 2) Hard ceiling crossed (>= 200 + bonus).
  if (count >= hardLimit) {
    return {
      ...base,
      allowed: false,
      tier: "block",
      retryAfter: BLOCK_HOURS * 3600,
      warn: true,
      message:
        "You've reached the maximum requests for today. Your teacher can grant more right away.",
    };
  }

  // 3) Throttle band (>= 100 + bonus, below hard ceiling).
  if (count >= limit) {
    const sinceLast = lastAt ? Date.now() - new Date(lastAt).getTime() : Infinity;
    const waitMs = THROTTLE_MINUTES * 60 * 1000;
    if (forRequest && sinceLast < waitMs) {
      return {
        ...base,
        allowed: false,
        tier: "throttle",
        retryAfter: Math.ceil((waitMs - sinceLast) / 1000),
        warn: true,
        message: `You're studying hard. To keep things fair, requests are spaced ${THROTTLE_MINUTES} minutes apart for the rest of today.`,
      };
    }
    return {
      ...base,
      tier: "throttle",
      warn: true,
      message: `You've passed today's main allowance — requests are now spaced ${THROTTLE_MINUTES} minutes apart.`,
    };
  }

  // 4) Warning band (>= 90 + bonus).
  if (count >= warnAt) {
    return {
      ...base,
      tier: "warn",
      warn: true,
      message: `You're nearing today's limit (${count}/${limit} requests used).`,
    };
  }

  return base;
}

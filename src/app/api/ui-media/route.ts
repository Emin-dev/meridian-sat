import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminToken } from "@/lib/adminauth";
import { isValidStudentToken } from "@/lib/studentauth";
import { apiError, badRequest, ok, parseJsonBody, reqString, reqId } from "@/lib/api";

/**
 * Decorative media visibility (additive feature, fork only).
 *
 * The app shows optional decorative media (an intro video on the home page and
 * line-art banners across the student + admin views). Either party can hide a
 * given piece of media; hiding is reversible (a low-opacity "restore" control
 * brings it back). State is stored per-user in the DB — never localStorage.
 *
 *  - scope='global'  → an admin hides a media key app-wide for everyone.
 *  - scope='student' → a student hides a media key for THEIR OWN view only.
 *
 * Resolution (what a viewer sees): a media key is hidden if a global row marks
 * it hidden, OR — for a signed-in student — that student's own row marks it
 * hidden. Restoring sets hidden=false (the row is kept so the action is
 * fully reversible).
 *
 * Auth:
 *  - GET is open. It only reveals which decorations are hidden, and global
 *    hides must apply on the pre-login home page too. A studentId, when passed,
 *    layers that student's personal hides on top (no token needed to READ which
 *    of your own decorations are hidden — it exposes nothing sensitive).
 *  - POST requires the matching token: admin for global writes, the student's
 *    own token (or an admin) for student writes.
 */

type Scope = "global" | "student";

// GET /api/ui-media?studentId=<uuid>
// -> { globalHidden: string[], studentHidden: string[] }
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const rawStudent = url.searchParams.get("studentId");
    const studentId = rawStudent ? reqId(rawStudent) : null;

    const supabase = getSupabaseAdmin();

    const { data: globalRows, error: gErr } = await supabase
      .from("ui_media")
      .select("media_key, hidden")
      .eq("scope", "global")
      .eq("hidden", true);
    if (gErr) return apiError("ui-media", gErr, 500);

    const globalHidden = (globalRows || []).map((r) => r.media_key as string);

    let studentHidden: string[] = [];
    if (studentId) {
      const { data: sRows, error: sErr } = await supabase
        .from("ui_media")
        .select("media_key, hidden")
        .eq("scope", "student")
        .eq("student_id", studentId)
        .eq("hidden", true);
      if (sErr) return apiError("ui-media", sErr, 500);
      studentHidden = (sRows || []).map((r) => r.media_key as string);
    }

    return ok({ globalHidden, studentHidden });
  } catch (err) {
    return apiError("ui-media", err);
  }
}

// POST /api/ui-media
// body: { media_key, scope, studentId?, hidden }
export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody<{
      media_key?: unknown;
      scope?: unknown;
      studentId?: unknown;
      hidden?: unknown;
    }>(req);
    if (!body) return badRequest("Invalid request body.");

    const mediaKey = reqString(body.media_key, { max: 80 });
    if (!mediaKey) return badRequest("media_key is required.");

    const scope = body.scope === "global" || body.scope === "student"
      ? (body.scope as Scope)
      : null;
    if (!scope) return badRequest("scope must be 'global' or 'student'.");

    const hidden = typeof body.hidden === "boolean" ? body.hidden : true;

    // --- Authorization ---
    if (scope === "global") {
      const adminTok = req.headers.get("x-admin-token");
      if (!isValidAdminToken(adminTok)) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    } else {
      const studentId = reqId(body.studentId);
      if (!studentId) return badRequest("studentId is required for student scope.");

      const sTok = req.headers.get("x-student-token");
      const aTok = req.headers.get("x-admin-token");
      const okStudent = isValidStudentToken(studentId, sTok);
      const okAdmin = aTok && isValidAdminToken(aTok);
      if (!okStudent && !okAdmin) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }

      const supabase = getSupabaseAdmin();
      const { data: existing, error: findErr } = await supabase
        .from("ui_media")
        .select("id")
        .eq("scope", "student")
        .eq("media_key", mediaKey)
        .eq("student_id", studentId)
        .maybeSingle();
      if (findErr) return apiError("ui-media", findErr, 500);

      if (existing) {
        const { error } = await supabase
          .from("ui_media")
          .update({ hidden, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) return apiError("ui-media", error, 500);
      } else {
        const { error } = await supabase.from("ui_media").insert({
          media_key: mediaKey,
          scope: "student",
          student_id: studentId,
          hidden,
        });
        if (error) return apiError("ui-media", error, 500);
      }
      return ok({ ok: true });
    }

    // scope === 'global'
    // The global uniqueness is a PARTIAL unique index (where scope='global'),
    // which on-conflict upsert can't target directly. So we do an explicit
    // find-then-update/insert against the single global row for this media_key.
    const supabase = getSupabaseAdmin();
    const { data: existing, error: findErr } = await supabase
      .from("ui_media")
      .select("id")
      .eq("scope", "global")
      .eq("media_key", mediaKey)
      .maybeSingle();
    if (findErr) return apiError("ui-media", findErr, 500);

    if (existing) {
      const { error } = await supabase
        .from("ui_media")
        .update({ hidden, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return apiError("ui-media", error, 500);
    } else {
      const { error } = await supabase.from("ui_media").insert({
        media_key: mediaKey,
        scope: "global",
        student_id: null,
        hidden,
      });
      if (error) return apiError("ui-media", error, 500);
    }
    return ok({ ok: true });
  } catch (err) {
    return apiError("ui-media", err);
  }
}

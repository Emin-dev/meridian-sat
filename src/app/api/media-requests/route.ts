import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, badRequest, ok, parseJsonBody, reqId, reqString } from "@/lib/api";

const KINDS = new Set(["image", "podcast", "video", "youtube"]);

// GET /api/media-requests?studentId=...           -> one student's own requests
// GET /api/media-requests?status=pending          -> admin review queue (all students)
// GET /api/media-requests                          -> admin: everything
//
// Media is NEVER auto-generated. Students ask here; a teacher reviews. A student
// may only read their OWN requests (requireStudent); the admin queue needs admin.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const studentId = searchParams.get("studentId");

  if (studentId) {
    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;
  } else {
    const unauth = requireAdmin(req);
    if (unauth) return unauth;
  }

  try {
    const supabase = getSupabaseAdmin();
    let q = supabase
      .from("media_requests")
      .select("*, students(name, access_code, status)")
      .order("created_at", { ascending: false });
    if (status) q = q.eq("status", status);
    if (studentId) q = q.eq("student_id", studentId);

    const { data, error } = await q;
    if (error) return apiError("media-requests:GET", error);
    return ok({ requests: data || [] });
  } catch (err) {
    return apiError("media-requests:GET", err);
  }
}

// POST /api/media-requests   (student creates a request)
// body: { studentId, kind, topic, note?, lessonId? }
export async function POST(req: NextRequest) {
  try {
    const body = await parseJsonBody(req);
    if (!body) return badRequest("Invalid request.");

    const studentId = reqId(body.studentId);
    if (!studentId) return badRequest("A valid student id is required.");

    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;

    const topic = reqString(body.topic, { max: 500 });
    if (!topic) return badRequest("Please describe what you'd like media about.");

    // Default to image when omitted; reject an explicit unknown kind.
    const kind = body.kind == null ? "image" : String(body.kind);
    if (!KINDS.has(kind)) {
      return badRequest("Unsupported media kind.");
    }
    const note = reqString(body.note, { max: 1000 }) || "";
    const lessonId = body.lessonId ? reqId(body.lessonId) : null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("media_requests")
      .insert({
        student_id: studentId,
        lesson_id: lessonId,
        kind,
        topic,
        note,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) return apiError("media-requests:POST", error);
    return ok({ request: data });
  } catch (err) {
    return apiError("media-requests:POST", err);
  }
}

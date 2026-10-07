import { guardLogin } from "@/lib/login-limit";
import { studentView } from "@/lib/student-view";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { studentToken } from "@/lib/studentauth";
import { apiError, badRequest, ok, parseJsonBody, reqString } from "@/lib/api";

// POST /api/student-auth -> log a student in with their access code.
// On success returns the student record AND a signed per-student token the
// browser sends as x-student-token so the API can verify the caller owns the id.
export async function POST(req: NextRequest) {
  try {
    const limited = await guardLogin("student");
    if (limited) return limited;
    const body = await parseJsonBody<{ code?: string }>(req);
    const code = reqString(body?.code, { max: 64 });
    if (!code) return badRequest("Access code is required.");

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("access_code", code)
      .maybeSingle();
    if (error) return apiError("student-auth", error);
    if (!data) return badRequest("Invalid access code.");

    return ok({ student: studentView(data), token: studentToken(data.id, data.access_code) });
  } catch (err) {
    return apiError("student-auth", err);
  }
}

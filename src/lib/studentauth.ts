import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isValidAdminToken } from "@/lib/adminauth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { issueSession, validSession } from "@/lib/session";

function signingKey(accessCode: string): string {
  const secret = process.env.STUDENT_TOKEN_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret || !accessCode) return "";
  // A changed access code invalidates old sessions without revealing the code.
  return createHmac("sha256", secret).update(`meridian-student-v2:${accessCode}`).digest("hex");
}

export function studentToken(studentId: string, accessCode: string): string {
  return issueSession(`student:${studentId}`, signingKey(accessCode));
}

export async function isValidStudentToken(studentId: string, token: string | null | undefined): Promise<boolean> {
  if (!studentId || !token || token.length > 2048 ||
      !(process.env.STUDENT_TOKEN_SECRET || process.env.ADMIN_PASSWORD)) return false;
  try {
    const { data, error } = await getSupabaseAdmin().from("students")
      .select("access_code").eq("id", studentId).maybeSingle();
    return !error && !!data && validSession(token, `student:${studentId}`, signingKey(data.access_code));
  } catch { return false; } // Configuration/storage failures never authorize callers.
}

export async function requireStudent(req: NextRequest, studentId: string): Promise<NextResponse | null> {
  if (isValidAdminToken(req.headers.get("x-admin-token"))) return null;
  if (await isValidStudentToken(studentId, req.headers.get("x-student-token"))) return null;
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

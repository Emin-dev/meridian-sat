import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateDraftPackage, fallbackPackage } from "@/lib/lessongen";
import { checkAndConsume } from "@/lib/ratelimit";
import { requireStudent } from "@/lib/studentauth";
import { studentView } from "@/lib/student-view";
import { badRequest, apiError, reqId } from "@/lib/api";

export const maxDuration = 60;

/** Only this endpoint moves a new student into the teacher review workflow. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const studentId = reqId(body?.studentId), answers = body?.answers;
    if (!studentId || !answers || typeof answers !== "object" || Array.isArray(answers) || JSON.stringify(answers).length > 12000) {
      return badRequest("A valid studentId and survey answers are required.");
    }
    const unauth = await requireStudent(req, studentId);
    if (unauth) return unauth;
    const supabase = getSupabaseAdmin();
    const { data: student, error: readError } = await supabase.from("students").select("*").eq("id", studentId).single();
    if (readError || !student) return apiError("onboarding", readError, 404, "Student not found.");

    // The fallback request and state transition are atomic. Repeated requests do
    // not create more drafts, spend AI quota or reset an active student's status.
    const { data: claim, error: claimError } = await supabase.rpc("begin_student_onboarding", {
      p_student_id: studentId, p_answers: answers, p_fallback: fallbackPackage(student),
    });
    if (claimError || !claim?.student) return apiError("onboarding", claimError || "Claim failed");
    if (claim.created) {
      try {
        const budget = await checkAndConsume(studentId);
        if (budget.allowed) {
          const pkg = await generateDraftPackage(student, answers, { lessonCount: 4 });
          if (Array.isArray(pkg.lessons) && pkg.lessons.length) {
            const { error } = await supabase.rpc("finish_student_onboarding", {
              p_request_id: claim.request_id, p_request_version: claim.request_version,
              p_package: pkg,
              p_previous_profile: { weak_areas: student.weak_areas, target_score: student.target_score },
            });
            if (error) throw error;
          }
        }
      } catch {
        // The atomic fallback is already in the review queue. No provider call
        // is made when quota storage fails or the allowance is denied.
        console.error("[onboarding] Personalization unavailable; fallback retained.");
      }
    }
    return NextResponse.json({ student: studentView(claim.student) });
  } catch (err) { return apiError("onboarding", err); }
}

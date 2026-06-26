import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateDraftPackage } from "@/lib/lessongen";
import { aiComplete } from "@/lib/deepseek";

export const maxDuration = 60;

// GET /api/lesson-requests/:id  -> single request with student
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("lesson_requests")
      .select("*, students(*)")
      .eq("id", params.id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ request: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

// PATCH /api/lesson-requests/:id
// body: { action: "edit" | "approve" | "deny" | "discuss" | "regenerate", ... }
//
//   edit       { study_plan?, ai_summary?, notes?, lessons? }  -> teacher manual edits
//   approve    {}                                              -> publish to student, unlock
//   deny       { feedback? }                                   -> mark denied + build new version
//   regenerate { feedback? }                                   -> same as deny (alias)
//   discuss    { message }                                     -> chat with AI about this draft
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = body.action;
    const supabase = getSupabaseAdmin();

    const { data: reqRow, error: rErr } = await supabase
      .from("lesson_requests")
      .select("*, students(*)")
      .eq("id", params.id)
      .single();
    if (rErr || !reqRow) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    const student = (reqRow as any).students;

    // ----- teacher manual edits -----------------------------------------
    if (action === "edit") {
      const update: Record<string, any> = {};
      for (const k of ["study_plan", "ai_summary", "notes", "lessons"]) {
        if (k in body) update[k] = body[k];
      }
      const { data, error } = await supabase
        .from("lesson_requests")
        .update(update)
        .eq("id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ request: data });
    }

    // ----- approve: publish to student, unlock --------------------------
    if (action === "approve") {
      // 1) Insert each draft lesson as a published lesson for the student.
      const lessons = Array.isArray(reqRow.lessons) ? reqRow.lessons : [];
      if (lessons.length > 0) {
        const rows = lessons.map((l: any) => ({
          student_id: reqRow.student_id,
          title: l.title || "Lesson",
          section: l.section || "Math",
          topic: l.topic || "",
          difficulty: l.difficulty || "Medium",
          content: l.content || "",
          questions: l.questions || [],
          study_plan: l.study_plan || "",
          status: "published",
        }));
        const { error: lErr } = await supabase.from("lessons").insert(rows);
        if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
      }

      // 2) Activate the student and publish plan + summary.
      const { error: sErr } = await supabase
        .from("students")
        .update({
          status: "active",
          study_plan: reqRow.study_plan || "",
          ai_summary: reqRow.ai_summary || "",
          notes: reqRow.notes || student?.notes || "",
        })
        .eq("id", reqRow.student_id);
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

      // 3) Mark this request approved.
      const { data, error } = await supabase
        .from("lesson_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ request: data, published: lessons.length });
    }

    // ----- deny / regenerate: build a new, better version ---------------
    if (action === "deny" || action === "regenerate") {
      const feedback = (body.feedback || "").toString();

      // Mark current request denied (kept for history).
      await supabase
        .from("lesson_requests")
        .update({
          status: "denied",
          feedback,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.id);

      // Build an improved package using the teacher's feedback + previous draft.
      const pkg = await generateDraftPackage(student, student.survey || {}, {
        feedback,
        previous: {
          study_plan: reqRow.study_plan,
          ai_summary: reqRow.ai_summary,
          lessons: reqRow.lessons,
        },
        lessonCount: Array.isArray(reqRow.lessons)
          ? Math.max(3, reqRow.lessons.length)
          : 4,
      });

      const { data: created, error: cErr } = await supabase
        .from("lesson_requests")
        .insert({
          student_id: reqRow.student_id,
          status: "pending",
          study_plan: pkg.study_plan,
          ai_summary: pkg.ai_summary,
          lessons: pkg.lessons,
          notes: pkg.notes,
          version: (reqRow.version || 1) + 1,
          feedback,
          discussion: [],
        })
        .select()
        .single();
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      return NextResponse.json({ request: created });
    }

    // ----- discuss: chat with AI about this draft -----------------------
    if (action === "discuss") {
      const message = (body.message || "").toString().trim();
      if (!message) {
        return NextResponse.json({ error: "message required" }, { status: 400 });
      }
      const discussion = Array.isArray(reqRow.discussion)
        ? reqRow.discussion
        : [];

      const system =
        "You are a co-teacher helping a human SAT tutor refine a draft lesson package for a specific student before it is approved. Be concise, concrete, and pedagogical. Suggest specific improvements. Do not output JSON unless asked.";
      const context = `Student: ${student?.name}. Draft summary: ${reqRow.ai_summary}
Draft study plan (excerpt): ${(reqRow.study_plan || "").slice(0, 1500)}
Draft lessons: ${(Array.isArray(reqRow.lessons) ? reqRow.lessons : [])
        .map((l: any) => `- ${l.title} (${l.section}, ${l.difficulty})`)
        .join("\n")}

Conversation so far:
${discussion.map((d: any) => `${d.role}: ${d.content}`).join("\n")}

teacher: ${message}`;

      const reply = await aiComplete(system, context, { temperature: 0.5 });
      const newDiscussion = [
        ...discussion,
        { role: "teacher", content: message },
        { role: "assistant", content: reply },
      ];
      const { data, error } = await supabase
        .from("lesson_requests")
        .update({ discussion: newDiscussion })
        .eq("id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ request: data, reply });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "failed" },
      { status: 500 }
    );
  }
}

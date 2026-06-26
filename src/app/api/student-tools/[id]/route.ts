import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// PATCH /api/student-tools/:id
// body: { action: "approve" | "deny" | "edit" }
//
//   approve  {}                                  -> student can now see this tool
//   deny     {}                                  -> dismissed, never shown
//   edit     { title?, description?, config? }   -> teacher tweaks before approving
//
// Approval is the gate: nothing in `student_tools` reaches the student until a
// teacher sets it to "approved" here.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = body?.action;
    const supabase = getSupabaseAdmin();

    if (action === "edit") {
      const update: Record<string, any> = {};
      for (const k of ["title", "description", "config", "icon"]) {
        if (k in body) update[k] = body[k];
      }
      const { data, error } = await supabase
        .from("student_tools")
        .update(update)
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ tool: data });
    }

    if (action === "approve" || action === "deny") {
      const { data, error } = await supabase
        .from("student_tools")
        .update({
          status: action === "approve" ? "approved" : "denied",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ tool: data });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

// DELETE /api/student-tools/:id  -> remove a proposal entirely
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("student_tools").delete().eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

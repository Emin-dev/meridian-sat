import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminauth";
import { apiError, badRequest, ok, parseJsonBody } from "@/lib/api";

// PATCH /api/media-requests/:id   (admin only)
// body: { action: "approve" | "deny" | "fulfill", assetId? }
//
//   approve  -> teacher accepts; they'll create the media in the studio
//   deny     -> request dismissed
//   fulfill  -> media has been created; link the produced asset
//
// Every transition is teacher-driven. Nothing here generates media on its own.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await parseJsonBody(req);
    if (!body) return badRequest("Invalid request.");
    const action = body.action;
    const supabase = getSupabaseAdmin();

    if (action === "approve" || action === "deny") {
      const { data, error } = await supabase
        .from("media_requests")
        .update({
          status: action === "approve" ? "approved" : "denied",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return apiError("media-requests/[id]", error);
      return ok({ request: data });
    }

    if (action === "fulfill") {
      const update: Record<string, any> = {
        status: "fulfilled",
        reviewed_at: new Date().toISOString(),
      };
      if (typeof body.assetId === "string") update.asset_id = body.assetId;
      const { data, error } = await supabase
        .from("media_requests")
        .update(update)
        .eq("id", params.id)
        .select("*")
        .single();
      if (error) return apiError("media-requests/[id]", error);
      return ok({ request: data });
    }

    return badRequest("Unknown action.");
  } catch (err) {
    return apiError("media-requests/[id]", err);
  }
}

// DELETE /api/media-requests/:id  -> remove a request entirely (admin)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("media_requests")
      .delete()
      .eq("id", params.id);
    if (error) return apiError("media-requests/[id]", error);
    return ok({ ok: true });
  } catch (err) {
    return apiError("media-requests/[id]", err);
  }
}

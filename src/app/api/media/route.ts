import { NextRequest, NextResponse } from "next/server";
import { listAssets, deleteAsset } from "@/lib/media";
import { requireAdmin } from "@/lib/adminauth";
import { requireStudent } from "@/lib/studentauth";
import { apiError, badRequest } from "@/lib/api";

export const runtime = "nodejs";

// GET /api/media?studentId=...  -> all media assets for a student.
// A student may view their OWN media library; admins may view anyone's
// (requireStudent allows an admin token through).
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) return badRequest("studentId required");
    const unauth = requireStudent(req, studentId);
    if (unauth) return unauth;
    const assets = await listAssets(studentId);
    return NextResponse.json({ assets });
  } catch (err) {
    return apiError("media", err);
  }
}

// DELETE /api/media?id=...  -> remove a media asset (and its storage files)
export async function DELETE(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError("media", err);
  }
}

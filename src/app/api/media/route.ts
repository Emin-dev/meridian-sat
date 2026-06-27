import { NextRequest, NextResponse } from "next/server";
import { listAssets, deleteAsset } from "@/lib/media";

export const runtime = "nodejs";

// GET /api/media?studentId=...  -> all media assets for a student
export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }
    const assets = await listAssets(studentId);
    return NextResponse.json({ assets });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

// DELETE /api/media?id=...  -> remove a media asset (and its storage files)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

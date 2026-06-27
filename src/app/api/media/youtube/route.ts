import { NextRequest, NextResponse } from "next/server";
import { searchYouTube, recordAsset } from "@/lib/media";

export const runtime = "nodejs";

// GET /api/media/youtube?q=...  -> search results to pick from
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q");
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
    const results = await searchYouTube(q);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

// POST /api/media/youtube  body: { studentId, video:{videoId,title,channel,thumbnail,url}, lessonId? }
// Saves a curated YouTube pick to the student's media library.
export async function POST(req: NextRequest) {
  try {
    const { studentId, video, lessonId } = await req.json();
    if (!studentId || !video?.url) {
      return NextResponse.json(
        { error: "studentId and a video are required." },
        { status: 400 }
      );
    }
    const asset = await recordAsset({
      studentId,
      lessonId: lessonId || null,
      kind: "youtube",
      title: video.title || "YouTube video",
      prompt: "",
      url: video.url,
      thumbnailUrl: video.thumbnail || "",
      meta: { videoId: video.videoId || "", channel: video.channel || "" },
    });
    return NextResponse.json({ asset });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "failed" }, { status: 500 });
  }
}

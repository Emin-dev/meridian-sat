import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateImage, uploadToStorage, recordAsset } from "@/lib/media";
import { refineImagePrompt } from "@/lib/mediagen";
import { requireAdmin } from "@/lib/adminauth";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/media/image
// body: { studentId, topic, section?, prompt?, lessonId? }
// Generates an educational diagram (free, Pollinations), stores it, records it.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { studentId, topic, section, prompt, lessonId } = await req.json();
    if (!studentId || (!topic && !prompt)) {
      return NextResponse.json(
        { error: "studentId and a topic or prompt are required." },
        { status: 400 }
      );
    }

    const finalPrompt =
      (prompt && String(prompt).trim()) ||
      (await refineImagePrompt(topic, section || "Math"));

    const { bytes, contentType } = await generateImage(finalPrompt);
    const path = `${studentId}/images/${Date.now()}.jpg`;
    const url = await uploadToStorage(path, bytes, contentType);

    const asset = await recordAsset({
      studentId,
      lessonId: lessonId || null,
      kind: "image",
      title: topic || finalPrompt.slice(0, 60),
      prompt: finalPrompt,
      url,
      thumbnailUrl: url,
    });

    return NextResponse.json({ asset });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Image generation failed." }, { status: 500 });
  }
}

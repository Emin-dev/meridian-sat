import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  generateImage,
  synthesizePodcast,
  uploadToStorage,
  recordAsset,
  hasGeminiKey,
} from "@/lib/media";
import { generateVideoBlueprint } from "@/lib/mediagen";
import type { PodcastTurn } from "@/lib/media";
import { requireAdmin } from "@/lib/adminauth";

export const runtime = "nodejs";
export const maxDuration = 300;

async function getStudent(id: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * POST /api/media/video — NotebookLM-style "Video Overview".
 *
 * Builds a narrated slideshow: DeepSeek writes a slide blueprint, Pollinations
 * renders a diagram per slide, and (when a Gemini key is present) Gemini TTS
 * narrates each slide. The result is stored as a single media asset whose
 * meta.slides[] drives an in-browser player (no server ffmpeg required, so it
 * runs fine on Vercel).
 *
 * body: { studentId, topic, section?, lessonId?, blueprintOnly? }
 */
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const body = await req.json();
    const { studentId, topic, section, lessonId, blueprintOnly } = body;
    if (!studentId || !topic) {
      return NextResponse.json({ error: "studentId and topic are required." }, { status: 400 });
    }

    const student = await getStudent(studentId);
    const plan = await generateVideoBlueprint(topic, student, section || "Math");

    if (blueprintOnly) {
      return NextResponse.json({ blueprint: plan });
    }

    const stamp = Date.now();
    const withAudio = hasGeminiKey();

    // Render each slide: image (always) + narration audio (if key present).
    const slides = await Promise.all(
      plan.slides.map(async (s, i) => {
        let imageUrl = "";
        try {
          const { bytes, contentType } = await generateImage(s.imagePrompt, {
            width: 1024,
            height: 576,
          });
          imageUrl = await uploadToStorage(
            `${studentId}/videos/${stamp}/slide-${i}.jpg`,
            bytes,
            contentType
          );
        } catch {
          imageUrl = "";
        }

        let audioUrl = "";
        if (withAudio && s.narration) {
          try {
            const turns: PodcastTurn[] = [{ speaker: "Host A", text: s.narration }];
            const wav = await synthesizePodcast(turns);
            audioUrl = await uploadToStorage(
              `${studentId}/videos/${stamp}/slide-${i}.wav`,
              wav,
              "audio/wav"
            );
          } catch {
            audioUrl = "";
          }
        }

        return {
          heading: s.heading,
          bullets: s.bullets,
          narration: s.narration,
          url: imageUrl,
          audioUrl,
        };
      })
    );

    const cover = slides.find((s) => s.url)?.url || "";

    const asset = await recordAsset({
      studentId,
      lessonId: lessonId || null,
      kind: "video",
      title: plan.title,
      prompt: topic,
      url: cover, // cover image for the gallery thumbnail
      thumbnailUrl: cover,
      meta: { summary: plan.summary, slides, hasAudio: withAudio },
    });

    return NextResponse.json({ asset, needsKey: !withAudio });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Video overview generation failed." },
      { status: 500 }
    );
  }
}

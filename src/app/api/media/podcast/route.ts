import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { synthesizePodcast, uploadToStorage, recordAsset, hasGeminiKey } from "@/lib/media";
import { generatePodcastScript } from "@/lib/mediagen";
import type { PodcastTurn } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 120;

async function getStudent(id: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  return data;
}

// POST /api/media/podcast
// body: { studentId, topic, section?, lessonId?, scriptOnly?, turns?, title?, summary? }
//   - scriptOnly:true  -> just return the DeepSeek-written 2-host script for review
//   - turns provided   -> synthesize audio from an (edited) script
//   - neither          -> write a script AND synthesize in one shot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, topic, section, lessonId, scriptOnly } = body;
    if (!studentId || !topic) {
      return NextResponse.json(
        { error: "studentId and topic are required." },
        { status: 400 }
      );
    }

    const student = await getStudent(studentId);

    // Step 1: produce / accept the script.
    let turns: PodcastTurn[] = Array.isArray(body.turns) ? body.turns : [];
    let title: string = body.title || "";
    let summary: string = body.summary || "";
    if (turns.length === 0) {
      const script = await generatePodcastScript(topic, student, section || "Math");
      turns = script.turns;
      title = title || script.title;
      summary = summary || script.summary;
    }

    if (scriptOnly) {
      return NextResponse.json({ script: { title, summary, turns } });
    }

    // Step 2: synthesize audio (requires Gemini key in env).
    if (!hasGeminiKey()) {
      return NextResponse.json(
        {
          error:
            "Podcast audio needs a Gemini API key. Add GEMINI_API_KEY in Vercel settings, then try again. The script above is ready to use.",
          script: { title, summary, turns },
          needsKey: true,
        },
        { status: 503 }
      );
    }

    const wav = await synthesizePodcast(turns);
    const path = `${studentId}/podcasts/${Date.now()}.wav`;
    const url = await uploadToStorage(path, wav, "audio/wav");

    const asset = await recordAsset({
      studentId,
      lessonId: lessonId || null,
      kind: "podcast",
      title: title || `${topic} — Audio Overview`,
      prompt: topic,
      url,
      meta: { summary, turns },
    });

    return NextResponse.json({ asset });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Podcast generation failed." },
      { status: 500 }
    );
  }
}

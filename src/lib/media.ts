import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Media generation toolkit for the per-student "Rich media" panel.
 *
 * This is the native, NotebookLM-style media engine. It is intentionally built
 * to run on free / unlimited resources the school already has:
 *
 *   • Images / diagrams  → Pollinations.ai (free, no key required)
 *   • Podcast audio       → Google Gemini TTS (multi-speaker, free tier)
 *   • Video overview      → image slideshow + podcast narration, played in the
 *                           browser (no server-side ffmpeg needed — works on
 *                           Vercel serverless)
 *   • YouTube clips       → YouTube Data API search (free quota) with a safe
 *                           keyless fallback to youtube.com search links
 *
 * Everything generated is uploaded to the public Supabase Storage `media`
 * bucket and recorded in the `media_assets` table, scoped to a student.
 */

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_TTS_MODEL = "models/gemini-2.5-flash-preview-tts";

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it in Vercel project settings to enable podcast & video-overview audio."
    );
  }
  return key;
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/* --------------------------------------------------------------------------
 * Supabase Storage helpers
 * ------------------------------------------------------------------------ */

const BUCKET = "media";

function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Upload raw bytes to the media bucket and return the public URL. */
export async function uploadToStorage(
  path: string,
  bytes: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return publicUrl(path);
}

/** Remove an object from the media bucket given its public URL (best-effort). */
export async function deleteFromStorageByUrl(url: string): Promise<void> {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  const supabase = getSupabaseAdmin();
  await supabase.storage.from(BUCKET).remove([path]);
}

/* --------------------------------------------------------------------------
 * Images / diagrams — Pollinations.ai (free, keyless)
 * ------------------------------------------------------------------------ */

export async function generateImage(
  prompt: string,
  opts: { width?: number; height?: number; seed?: number } = {}
): Promise<{ bytes: Buffer; contentType: string }> {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 640;
  const seed = opts.seed ?? Math.floor(Math.random() * 1_000_000);
  // Keep it educational & clean.
  const styled = `${prompt}. Clean educational diagram, high contrast, clear labels, textbook illustration style, minimal, white background`;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(styled)}` +
    `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=flux`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    throw new Error("Image generation returned an empty image. Try again.");
  }
  return { bytes: buf, contentType: "image/jpeg" };
}

/* --------------------------------------------------------------------------
 * Podcast audio — Gemini multi-speaker TTS
 * ------------------------------------------------------------------------ */

// Gemini TTS returns raw PCM (L16, 24kHz, mono). We wrap it in a WAV header so
// browsers can play it directly.
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export type PodcastTurn = { speaker: "Host A" | "Host B"; text: string };

/**
 * Synthesize a two-host dialogue into a single WAV buffer using Gemini's
 * multi-speaker TTS. `Host A` = warm female voice (Kore), `Host B` = energetic
 * male voice (Puck).
 */
export async function synthesizePodcast(turns: PodcastTurn[]): Promise<Buffer> {
  const key = geminiKey();
  // Compose the dialogue as a single prompt; Gemini handles speaker switching.
  const transcript = turns
    .map((t) => `${t.speaker}: ${t.text}`)
    .join("\n");

  const body = {
    contents: [
      {
        parts: [
          {
            text:
              "Read this two-person SAT study podcast aloud naturally, warm and engaging:\n\n" +
              transcript,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: "Host A",
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
            },
            {
              speaker: "Host B",
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
            },
          ],
        },
      },
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_TTS_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Podcast audio failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0];
  const b64 = part?.inlineData?.data || part?.inline_data?.data;
  if (!b64) {
    throw new Error("Podcast audio response had no audio content.");
  }
  const pcm = Buffer.from(b64, "base64");
  // Parse sample rate from mimeType if present (e.g. "audio/L16;codec=pcm;rate=24000").
  const mime: string = part?.inlineData?.mimeType || part?.inline_data?.mime_type || "";
  const rateMatch = mime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  return pcmToWav(pcm, sampleRate);
}

/* --------------------------------------------------------------------------
 * YouTube curation — Data API with keyless fallback
 * ------------------------------------------------------------------------ */

export type YouTubeHit = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  url: string;
};

export async function searchYouTube(query: string, max = 6): Promise<YouTubeHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  const q = `${query} SAT prep explained`;
  if (key) {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video` +
      `&maxResults=${max}&safeSearch=strict&relevanceLanguage=en` +
      `&q=${encodeURIComponent(q)}&key=${key}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return (data.items || []).map((it: any) => ({
        videoId: it.id.videoId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        thumbnail:
          it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || "",
        url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
      }));
    }
  }
  // Keyless fallback: return a single "search on YouTube" entry so the teacher
  // can still curate. The UI handles this gracefully.
  return [
    {
      videoId: "",
      title: `Search YouTube for "${query} SAT"`,
      channel: "YouTube",
      thumbnail: "",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    },
  ];
}

/* --------------------------------------------------------------------------
 * media_assets table helpers
 * ------------------------------------------------------------------------ */

export type MediaKind = "image" | "podcast" | "video" | "youtube";

export async function recordAsset(row: {
  studentId: string;
  lessonId?: string | null;
  kind: MediaKind;
  title: string;
  prompt?: string;
  url: string;
  thumbnailUrl?: string;
  meta?: Record<string, any>;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      student_id: row.studentId,
      lesson_id: row.lessonId ?? null,
      kind: row.kind,
      title: row.title,
      prompt: row.prompt ?? "",
      url: row.url,
      thumbnail_url: row.thumbnailUrl ?? "",
      meta: row.meta ?? {},
      status: "ready",
    })
    .select()
    .single();
  if (error) throw new Error(`Saving media record failed: ${error.message}`);
  return data;
}

export async function listAssets(studentId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("media_assets")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return data || [];
}

export async function deleteAsset(id: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("media_assets")
    .select("url, meta")
    .eq("id", id)
    .maybeSingle();
  if (data?.url) await deleteFromStorageByUrl(data.url).catch(() => {});
  // Video overviews store multiple slide image URLs in meta.slides[].
  const slides = (data?.meta as any)?.slides as { url: string }[] | undefined;
  if (Array.isArray(slides)) {
    for (const s of slides) await deleteFromStorageByUrl(s.url).catch(() => {});
  }
  await supabase.from("media_assets").delete().eq("id", id);
}

import { aiComplete, parseJsonFromModel } from "@/lib/deepseek";
import type { Student } from "@/lib/supabase";
import type { PodcastTurn } from "@/lib/media";

/**
 * Content blueprints for the rich-media tools. DeepSeek (unlimited, max-quality
 * reasoning) writes the actual teaching content; media.ts turns it into audio,
 * images and slideshows.
 */

function studentContext(student: Student | null): string {
  if (!student) return "";
  const parts = [
    `Student: ${student.name}`,
    student.grade ? `Grade: ${student.grade}` : "",
    student.target_score ? `Target SAT score: ${student.target_score}` : "",
    student.weak_areas?.length
      ? `Weak areas: ${student.weak_areas.join(", ")}`
      : "",
  ].filter(Boolean);
  return parts.join(". ") + ".";
}

/* --------------------------------------------------------------------------
 * Podcast script (two hosts, NotebookLM-style audio overview)
 * ------------------------------------------------------------------------ */

export async function generatePodcastScript(
  topic: string,
  student: Student | null,
  section: string
): Promise<{ title: string; turns: PodcastTurn[]; summary: string }> {
  const system = `You are a producer of short, lively educational podcasts in the style of NotebookLM "Audio Overview".
Two hosts have a natural, warm, back-and-forth conversation that teaches an SAT topic clearly.
Host A is encouraging and explains concepts; Host B asks the smart questions a student would ask and adds memorable tips.
Keep it engaging, concrete, and exam-focused. Use real SAT-style examples. No filler.
Return ONLY valid JSON, no code fences.`;

  const user = `Create a 2-3 minute audio-overview podcast that teaches this SAT topic.

Topic: ${topic}
SAT section: ${section}
${studentContext(student)}

Return JSON exactly:
{
  "title": "catchy episode title",
  "summary": "one-sentence description of what the episode covers",
  "turns": [
    { "speaker": "Host A", "text": "..." },
    { "speaker": "Host B", "text": "..." }
  ]
}

Rules:
- 12-18 turns, alternating speakers, starting with Host A.
- Each turn is 1-3 sentences of natural spoken language (no markdown, no lists).
- Open with a friendly hook, teach the core idea with one worked example, end with a quick recap and an encouraging sign-off.
- Personalize gently to the student when context is given.`;

  const raw = await aiComplete(system, user, { json: true, maxTokens: 8000, temperature: 0.8 });
  const data = parseJsonFromModel(raw);

  let turns: PodcastTurn[] = Array.isArray(data.turns)
    ? data.turns
        .filter((t: any) => t && typeof t.text === "string" && t.text.trim())
        .map((t: any) => ({
          speaker: t.speaker === "Host B" ? "Host B" : "Host A",
          text: String(t.text).trim(),
        }))
    : [];

  // Safety net so audio synthesis always has content.
  if (turns.length < 2) {
    turns = [
      { speaker: "Host A", text: `Welcome back. Today we're breaking down ${topic} for the SAT.` },
      { speaker: "Host B", text: `Let's make it simple and give a clear example students can remember.` },
    ];
  }

  return {
    title: data.title || `${topic} — Audio Overview`,
    summary: data.summary || `An audio overview of ${topic}.`,
    turns,
  };
}

/* --------------------------------------------------------------------------
 * Video overview blueprint (narrated slideshow, NotebookLM "Video Overview")
 * ------------------------------------------------------------------------ */

export type VideoSlideSpec = {
  heading: string;
  bullets: string[];
  imagePrompt: string;
  narration: string;
};

export async function generateVideoBlueprint(
  topic: string,
  student: Student | null,
  section: string
): Promise<{ title: string; summary: string; slides: VideoSlideSpec[] }> {
  const system = `You design short narrated "video overview" lessons in the style of NotebookLM Video Overviews:
a sequence of clean slides, each with a heading, a few bullet points, a matching diagram, and spoken narration.
You teach an SAT topic visually and clearly. Return ONLY valid JSON, no code fences.`;

  const user = `Create a 5-7 slide narrated video overview teaching this SAT topic.

Topic: ${topic}
SAT section: ${section}
${studentContext(student)}

Return JSON exactly:
{
  "title": "video title",
  "summary": "one-sentence description",
  "slides": [
    {
      "heading": "short slide heading (max 6 words)",
      "bullets": ["concise point", "concise point"],
      "imagePrompt": "vivid description of a clean educational diagram illustrating this slide",
      "narration": "1-3 sentences of spoken narration for this slide"
    }
  ]
}

Rules:
- 5 to 7 slides total.
- Slide 1 is a friendly title/intro slide; final slide is a recap + encouragement.
- bullets: 2-3 short phrases each (no full sentences, no markdown).
- imagePrompt: describe a labeled diagram, chart, or visual metaphor relevant to the slide.
- narration: natural spoken language that pairs with the slide.`;

  const raw = await aiComplete(system, user, { json: true, maxTokens: 8000, temperature: 0.7 });
  const data = parseJsonFromModel(raw);

  let slides: VideoSlideSpec[] = Array.isArray(data.slides)
    ? data.slides
        .filter((s: any) => s && (s.heading || s.narration))
        .map((s: any) => ({
          heading: String(s.heading || "").trim() || topic,
          bullets: Array.isArray(s.bullets)
            ? s.bullets.map((b: any) => String(b).trim()).filter(Boolean).slice(0, 3)
            : [],
          imagePrompt: String(s.imagePrompt || s.heading || topic).trim(),
          narration: String(s.narration || "").trim(),
        }))
    : [];

  if (slides.length === 0) {
    slides = [
      {
        heading: topic,
        bullets: ["Key idea", "Worked example", "Quick recap"],
        imagePrompt: `Clean educational diagram explaining ${topic} for the SAT`,
        narration: `Let's explore ${topic} for the SAT.`,
      },
    ];
  }

  return {
    title: data.title || `${topic} — Video Overview`,
    summary: data.summary || `A narrated video overview of ${topic}.`,
    slides: slides.slice(0, 7),
  };
}

/* --------------------------------------------------------------------------
 * Image prompt helper (for the standalone image/diagram tool)
 * ------------------------------------------------------------------------ */

export async function refineImagePrompt(
  topic: string,
  section: string
): Promise<string> {
  try {
    const raw = await aiComplete(
      `You write concise image-generation prompts for clean educational SAT diagrams. Return ONLY the prompt text, one line.`,
      `Write a single vivid prompt for a labeled educational diagram that helps a student understand "${topic}" (SAT ${section}). Keep it under 40 words.`,
      { maxTokens: 2000, temperature: 0.6 }
    );
    return raw.trim().replace(/^["']|["']$/g, "") || topic;
  } catch {
    return `Labeled educational diagram explaining ${topic} for the SAT ${section} section`;
  }
}

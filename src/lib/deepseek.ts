import OpenAI from "openai";

// DeepSeek V4 Pro is OpenAI-compatible.
// Base URL: https://api.deepseek.com  |  Model: deepseek-v4-pro
// The key is read from the environment — NEVER hardcoded.
export function getDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to .env.local (local) or Vercel env vars (production)."
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
}

export const DEEPSEEK_MODEL = "deepseek-v4-pro";

// Fill {{placeholders}} in a prompt template.
export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : `{{${key}}}`
  );
}

// Convenience: run a single chat completion and return the text content.
export async function aiComplete(
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const client = getDeepSeek();
  // IMPORTANT: deepseek-v4-pro is a reasoning model. It spends completion tokens
  // on hidden reasoning BEFORE producing the visible answer. If max_tokens is
  // too low (or unset and defaulting low), reasoning consumes the whole budget
  // and `content` comes back EMPTY with finish_reason "length". We therefore set
  // a generous default so there is always room for the real answer after the
  // model finishes reasoning. This was the root cause of lesson generation
  // silently returning empty packages.
  const completion = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 8000,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  return completion.choices[0]?.message?.content || "";
}

// Extract a JSON object from a model response that may contain code fences.
export function parseJsonFromModel(text: string): any {
  let cleaned = text.trim();
  // strip ```json ... ``` fences if present
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  // fall back to first { ... last }
  if (!cleaned.startsWith("{")) {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last !== -1) cleaned = cleaned.slice(first, last + 1);
  }
  return JSON.parse(cleaned);
}

/**
 * DeepSeek client — plain fetch, no SDK.
 *
 * Previously this wrapped the `openai` SDK (DeepSeek is OpenAI-compatible). The
 * SDK pulled in a large dependency just to POST a single JSON body, so we now
 * call the chat-completions endpoint directly with `fetch`. The public surface
 * (`aiComplete`, `fillTemplate`, `parseJsonFromModel`) is unchanged, so callers
 * don't need to know the transport.
 *
 * The API key is read from the environment — NEVER hardcoded.
 */

const DEEPSEEK_BASE = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-v4-pro";

function getApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to .env.local (local) or Vercel env vars (production)."
    );
  }
  return apiKey;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Low-level chat-completion call. Returns the visible assistant text.
 * Mirrors the OpenAI Chat Completions shape DeepSeek implements.
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: opts.temperature ?? 0.7,
      // deepseek-v4-pro is a reasoning model: it spends completion tokens on
      // hidden reasoning BEFORE the visible answer. Too low a budget means
      // reasoning eats it all and `content` returns EMPTY (finish_reason
      // "length"). Keep a generous default so the real answer always fits.
      max_tokens: opts.maxTokens ?? 8000,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    // Body may carry useful detail for server logs; never surfaced to clients.
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// Fill {{placeholders}} in a prompt template.
export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : `{{${key}}}`
  );
}

// Convenience: run a single system+user chat completion, return the text.
export async function aiComplete(
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  return chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    opts
  );
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

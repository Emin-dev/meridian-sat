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
  opts: {
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
    // Reasoning models accept an effort dial. "high" = think harder (best
    // quality, slower). Pass this for content where quality matters most
    // (e.g. SAT question authoring). Omitted = model default.
    reasoningEffort?: "low" | "medium" | "high";
  } = {}
): Promise<string> {
  // Hard timeout so a slow upstream call can't hang indefinitely. Generous
  // ceiling (deepseek-v4-pro reasoning can take 30-60s on rich prompts) while
  // still staying under the 300s serverless function budget; on abort the
  // caller treats it as a transient failure and the chain re-calls.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    signal: controller.signal,
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
      ...(opts.reasoningEffort
        ? { reasoning_effort: opts.reasoningEffort }
        : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  } finally {
    clearTimeout(timer);
  }

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
  opts: {
    json?: boolean;
    temperature?: number;
    maxTokens?: number;
    reasoningEffort?: "low" | "medium" | "high";
  } = {}
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
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // The model frequently emits LaTeX math inside JSON strings (\(, \[, \sqrt,
    // \frac, \times, ...). A lone backslash that isn't a valid JSON escape makes
    // JSON.parse throw "Bad escaped character". Repair by escaping any backslash
    // that is NOT already part of a valid JSON escape (\" \\ \/ \b \f \n \r \t \uXXXX).
    try {
      const repaired = cleaned.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(repaired);
    } catch {
      // Repair made things worse (or the problem wasn't backslashes). Re-throw
      // the ORIGINAL error so logs reflect the true cause, not the repair's.
      throw firstErr;
    }
  }
}

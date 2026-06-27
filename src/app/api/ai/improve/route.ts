import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/deepseek";
import { requireAdmin } from "@/lib/adminauth";
import { apiError } from "@/lib/api";

export const maxDuration = 45;

// POST /api/ai/improve  body: { text, action, context? }
// action: "improve" | "expand" | "fix" | "shorten"
// Generic AI text helper used by the small "AI" button next to text fields.
export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  try {
    const { text, action = "improve", context = "" } = await req.json();
    const verbs: Record<string, string> = {
      improve: "Rewrite the text to be clearer, more polished, and well-structured.",
      expand: "Expand the text with more helpful detail and examples.",
      fix: "Fix grammar, spelling, and clarity issues. Keep the meaning.",
      shorten: "Make the text more concise while keeping the key points.",
    };
    const system =
      "You are an editing assistant for an SAT tutoring app. Return ONLY the revised text, no quotes, no commentary. Preserve any Markdown and LaTeX (\\( \\), \\[ \\]).";
    const user = `${verbs[action] || verbs.improve}${
      context ? ` Context: ${context}.` : ""
    }\n\nText:\n${text || ""}`;
    const result = await aiComplete(system, user, { temperature: 0.6 });
    return NextResponse.json({ text: result.trim() });
  } catch (err) {
    return apiError("ai/improve", err);
  }
}

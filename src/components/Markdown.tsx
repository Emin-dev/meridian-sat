"use client";

import "katex/contrib/mhchem"; // enables \ce{...} chemistry notation
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MathDiagram from "@/components/MathDiagram";

/**
 * Rich content renderer for lessons, questions, explanations and AI output.
 *
 * Supports:
 *  - Full Markdown (headings, lists, tables, blockquotes, code) via remark-gfm
 *  - Real typeset math via KaTeX:  inline \( ... \) or $...$, display \[ ... \] or $$...$$
 *  - Chemistry / science notation via mhchem:  \ce{H2O}, \ce{2H2 + O2 -> 2H2O}
 *  - Inline diagrams & graphs via fenced ```plot / ```figure blocks (JSON spec)
 */

/**
 * remark-math only understands $...$ and $$...$$ delimiters. Models (and our
 * prompts) emit LaTeX with \( ... \) and \[ ... \]. Normalize those to $-delimiters
 * so every equation typesets. We skip fenced code blocks so plot/figure JSON and
 * any literal code is left untouched.
 */
function normalizeMath(src: string): string {
  if (!src) return "";
  const parts = src.split(/(```[\s\S]*?```|`[^`]*`)/g);
  return parts
    .map((seg, i) => {
      // odd segments are the captured code spans/blocks — leave as-is
      if (i % 2 === 1) return seg;
      return seg
        .replace(/\\\[((?:[^\\]|\\(?!\]))*?)\\\]/g, (_m, inner) => `\n\n$$${inner}$$\n\n`)
        .replace(/\\\(((?:[^\\]|\\(?!\)))*?)\\\)/g, (_m, inner) => `$${inner}$`);
    })
    .join("");
}

function tryParse(json: string): any | null {
  try {
    return JSON.parse(json);
  } catch {
    // tolerate a trailing comma / single quotes from the model
    try {
      return JSON.parse(json.replace(/'/g, '"').replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-sat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, trust: true }]]}
        components={{
          code({ node, className, children, ...props }: any) {
            const lang = /language-(\w+)/.exec(className || "")?.[1];
            const raw = String(children).replace(/\n$/, "");
            if (lang === "plot" || lang === "figure" || lang === "diagram") {
              const spec = tryParse(raw);
              if (spec) return <MathDiagram spec={spec} />;
            }
            // inline or unknown-language code → default rendering
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {normalizeMath(children || "")}
      </ReactMarkdown>
    </div>
  );
}

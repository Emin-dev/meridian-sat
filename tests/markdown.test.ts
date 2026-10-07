import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "@/components/Markdown";
describe("patched KaTeX rendering", () => {
  it("renders ordinary SAT equations and chemistry", () => {
    const html = renderToStaticMarkup(createElement(Markdown, null, "$\\frac{1}{2}$ and $\\ce{H2O}$"));
    expect(html).toContain("katex");
    expect(html).not.toContain("katex-error");
  });
  it("does not trust HTML or links embedded in generated math", () => {
    const html = renderToStaticMarkup(createElement(Markdown, null, "$\\href{javascript:alert(1)}{click}$ <script>alert(1)</script>"));
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<script>");
  });
});

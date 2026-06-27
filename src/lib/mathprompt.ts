// Shared instruction block that teaches the model to write REAL exam-style math
// and science notation, plus inline diagrams. Imported by every AI route that
// produces teaching content so math always renders properly (KaTeX + diagrams).

export const MATH_AUTHORING = `
MATH & SCIENCE FORMATTING (REQUIRED — content is rendered with Markdown + KaTeX):
- Write ALL math as real LaTeX so it typesets like a printed exam, never as plain ASCII.
  - Inline math: \\( ... \\)   e.g. the slope is \\( m = \\frac{y_2 - y_1}{x_2 - x_1} \\).
  - Display (a worked step on its own line): \\[ ... \\]
  - NEVER write things like "x^2" , "1/2", "sqrt(x)", or "y = mx + b" as raw text. Use \\( x^2 \\), \\( \\frac{1}{2} \\), \\( \\sqrt{x} \\), \\( y = mx + b \\).
  - Use proper LaTeX: \\frac{}{}, ^{}, _{}, \\sqrt{}, \\times, \\div, \\le, \\ge, \\neq, \\pm, \\pi, \\theta, \\angle, \\degree, matrices, systems with \\begin{cases}.
- Chemistry / science: use mhchem, e.g. \\( \\ce{H2O} \\), \\( \\ce{2H2 + O2 -> 2H2O} \\), and units like \\( 9.8\\,\\text{m/s}^2 \\).
- DIAGRAMS & GRAPHS — add one whenever a graph, geometric figure, or data table would appear on a real test. Emit a fenced code block:
  - Function/parabola/line graph:
    \`\`\`plot
    {"type":"function","fns":["x^2-2","2*x+1"],"xRange":[-5,5],"yRange":[-4,8],"title":"y = x^2 - 2"}
    \`\`\`
  - A specific line by slope/intercept: {"type":"line","m":2,"b":-3,"xRange":[-5,5],"yRange":[-8,8]}
  - Scatter / data points: {"type":"scatter","data":[[1,2],[2,4],[3,5]],"xRange":[0,5],"yRange":[0,6]}
  - Geometry figures:
    \`\`\`figure
    {"type":"triangle","points":[[0,0],[4,0],[0,3]],"labels":["A","B","C"],"right":"A","title":"Right triangle"}
    \`\`\`
    Also supported: {"type":"rectangle","points":[[0,0],[5,0],[5,3],[0,3]],"labels":["A","B","C","D"]} and {"type":"circle","center":[0,0],"radius":3}.
  - plot/figure blocks MUST contain valid JSON on the rules above. Use simple function syntax (x, +, -, *, /, ^, sqrt(), sin(), cos()). Do not invent other keys.
- ANSWER CHOICES: every choice MUST begin with its letter prefix "A) ", "B) ", "C) ", "D) " and the "answer" field MUST be just that letter (e.g. "B"). Put any math AFTER the prefix, e.g. "A) \\( \\frac{3}{4} \\)". Never start a choice with a backslash.
- Use Markdown tables for any "data analysis" question that shows a table of values.
- Keep prose clear; reserve display math \\[ \\] for important results and worked steps.
`.trim();

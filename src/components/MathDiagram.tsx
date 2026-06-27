"use client";

/**
 * MathDiagram — renders exam-style graphs and geometry figures from a small JSON spec.
 * No external dependencies: everything is hand-drawn SVG so it works in the sandbox
 * and on Vercel without extra bundles.
 *
 * The AI emits a fenced code block like:
 *   ```plot
 *   { "type": "function", "fns": ["x^2 - 2"], "xRange": [-4,4], "yRange": [-2,8] }
 *   ```
 * or a geometry figure:
 *   ```figure
 *   { "type": "triangle", "points": [[0,0],[4,0],[0,3]], "labels": ["A","B","C"], "right": "A" }
 *   ```
 */

type PlotSpec = {
  type: "function" | "line" | "scatter" | "triangle" | "rectangle" | "circle" | "points";
  // function plotting
  fns?: string[];
  xRange?: [number, number];
  yRange?: [number, number];
  // line: y = m x + b  OR  two points
  m?: number;
  b?: number;
  // scatter / points
  data?: [number, number][];
  // geometry
  points?: [number, number][];
  labels?: string[];
  right?: string; // label of right-angle vertex
  radius?: number;
  center?: [number, number];
  title?: string;
};

const COLORS = ["#3366ff", "#e8590c", "#2f9e44", "#9c36b5", "#0b7285"];

// tiny, safe expression evaluator for f(x): supports + - * / ^, parentheses,
// x, and common functions. Avoids eval by tokenizing -> shunting yard -> RPN.
function makeFn(expr: string): (x: number) => number {
  const e = expr.replace(/\s+/g, "");
  const tokens: string[] = [];
  let i = 0;
  const fns = ["sin", "cos", "tan", "sqrt", "abs", "log", "ln", "exp"];
  while (i < e.length) {
    const c = e[i];
    if (/[0-9.]/.test(c)) {
      let n = c;
      i++;
      while (i < e.length && /[0-9.]/.test(e[i])) n += e[i++];
      tokens.push(n);
      continue;
    }
    if (/[a-z]/i.test(c)) {
      let s = c;
      i++;
      while (i < e.length && /[a-z]/i.test(e[i])) s += e[i++];
      tokens.push(s);
      continue;
    }
    if ("+-*/^(),".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    i++;
  }
  // shunting yard
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
  const rightAssoc: Record<string, boolean> = { "^": true };
  const isFn = (t: string) => fns.includes(t);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (/^[0-9.]+$/.test(t) || t === "x" || t === "pi" || t === "e") out.push(t);
    else if (isFn(t)) ops.push(t);
    else if (t in prec) {
      // unary minus
      if (t === "-" && (k === 0 || ["+", "-", "*", "/", "^", "("].includes(tokens[k - 1]))) {
        out.push("0");
      }
      while (
        ops.length &&
        ops[ops.length - 1] in prec &&
        (rightAssoc[t]
          ? prec[ops[ops.length - 1]] > prec[t]
          : prec[ops[ops.length - 1]] >= prec[t])
      )
        out.push(ops.pop()!);
      ops.push(t);
    } else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()!);
      ops.pop();
      if (ops.length && isFn(ops[ops.length - 1])) out.push(ops.pop()!);
    }
  }
  while (ops.length) out.push(ops.pop()!);

  return (x: number) => {
    const st: number[] = [];
    for (const t of out) {
      if (t === "x") st.push(x);
      else if (t === "pi") st.push(Math.PI);
      else if (t === "e") st.push(Math.E);
      else if (/^[0-9.]+$/.test(t)) st.push(parseFloat(t));
      else if (fns.includes(t)) {
        const a = st.pop()!;
        const map: Record<string, number> = {
          sin: Math.sin(a),
          cos: Math.cos(a),
          tan: Math.tan(a),
          sqrt: Math.sqrt(a),
          abs: Math.abs(a),
          log: Math.log10(a),
          ln: Math.log(a),
          exp: Math.exp(a),
        };
        st.push(map[t]);
      } else {
        const b = st.pop()!;
        const a = st.pop()!;
        if (t === "+") st.push(a + b);
        else if (t === "-") st.push(a - b);
        else if (t === "*") st.push(a * b);
        else if (t === "/") st.push(a / b);
        else if (t === "^") st.push(Math.pow(a, b));
      }
    }
    return st.pop() ?? NaN;
  };
}

export default function MathDiagram({ spec }: { spec: PlotSpec }) {
  const W = 360;
  const H = 300;
  const pad = 32;

  const isGeometry = ["triangle", "rectangle", "circle", "points"].includes(spec.type);

  // ----- Coordinate plane (function / line / scatter) -----
  if (!isGeometry) {
    const xR = spec.xRange ?? [-6, 6];
    const yR = spec.yRange ?? [-6, 6];
    const sx = (x: number) => pad + ((x - xR[0]) / (xR[1] - xR[0])) * (W - 2 * pad);
    const sy = (y: number) => H - pad - ((y - yR[0]) / (yR[1] - yR[0])) * (H - 2 * pad);

    const gridLines: JSX.Element[] = [];
    for (let gx = Math.ceil(xR[0]); gx <= xR[1]; gx++) {
      gridLines.push(
        <line key={`vx${gx}`} x1={sx(gx)} y1={pad} x2={sx(gx)} y2={H - pad} stroke="#eef2f7" />
      );
    }
    for (let gy = Math.ceil(yR[0]); gy <= yR[1]; gy++) {
      gridLines.push(
        <line key={`hy${gy}`} x1={pad} y1={sy(gy)} x2={W - pad} y2={sy(gy)} stroke="#eef2f7" />
      );
    }

    const curves: JSX.Element[] = [];
    const allFns = [...(spec.fns ?? [])];
    if (spec.type === "line" && spec.m !== undefined) {
      allFns.push(`${spec.m}*x+${spec.b ?? 0}`);
    }
    allFns.forEach((expr, idx) => {
      const f = makeFn(expr);
      const pts: string[] = [];
      const steps = 200;
      for (let s = 0; s <= steps; s++) {
        const x = xR[0] + (s / steps) * (xR[1] - xR[0]);
        const y = f(x);
        if (!isFinite(y) || y < yR[0] - 2 || y > yR[1] + 2) {
          pts.push("");
          continue;
        }
        pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
      }
      const segs = pts.join(" ").split("  ").filter(Boolean);
      segs.forEach((seg, si) =>
        curves.push(
          <polyline
            key={`c${idx}-${si}`}
            points={seg}
            fill="none"
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )
      );
    });

    const scatter =
      spec.data?.map((p, i) => (
        <circle key={`p${i}`} cx={sx(p[0])} cy={sy(p[1])} r={4} fill="#e8590c" />
      )) ?? [];

    return (
      <figure className="math-diagram">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={spec.title || "graph"}>
          {gridLines}
          {/* axes */}
          <line x1={pad} y1={sy(0)} x2={W - pad} y2={sy(0)} stroke="#94a3b8" strokeWidth={1.5} />
          <line x1={sx(0)} y1={pad} x2={sx(0)} y2={H - pad} stroke="#94a3b8" strokeWidth={1.5} />
          {/* axis ticks/labels */}
          <text x={W - pad + 2} y={sy(0) + 4} fontSize="11" fill="#64748b">x</text>
          <text x={sx(0) + 4} y={pad - 4} fontSize="11" fill="#64748b">y</text>
          {curves}
          {scatter}
        </svg>
        {spec.title && <figcaption>{spec.title}</figcaption>}
      </figure>
    );
  }

  // ----- Geometry figures -----
  // normalize geometry coordinates into the viewbox
  const allPts: [number, number][] =
    spec.points ?? (spec.center ? [spec.center] : [[0, 0]]);
  const radius = spec.radius ?? 0;
  const xs = allPts.map((p) => p[0]).concat(spec.center ? [spec.center[0] - radius, spec.center[0] + radius] : []);
  const ys = allPts.map((p) => p[1]).concat(spec.center ? [spec.center[1] - radius, spec.center[1] + radius] : []);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const gx = (x: number) => pad + (x - minX) * scale;
  const gy = (y: number) => H - pad - (y - minY) * scale;

  const shapes: JSX.Element[] = [];
  const labelEls: JSX.Element[] = [];

  if (spec.type === "triangle" || spec.type === "rectangle" || spec.type === "points") {
    const poly = allPts.map((p) => `${gx(p[0])},${gy(p[1])}`).join(" ");
    if (spec.type !== "points") {
      shapes.push(
        <polygon key="poly" points={poly} fill="#eff4ff" stroke="#3366ff" strokeWidth={2.5} />
      );
    }
    allPts.forEach((p, i) => {
      shapes.push(<circle key={`v${i}`} cx={gx(p[0])} cy={gy(p[1])} r={3.5} fill="#1e293b" />);
      const lbl = spec.labels?.[i];
      if (lbl)
        labelEls.push(
          <text key={`l${i}`} x={gx(p[0]) + 6} y={gy(p[1]) - 6} fontSize="13" fontWeight="600" fill="#0f172a">
            {lbl}
          </text>
        );
    });
    // right-angle marker
    if (spec.right && spec.labels) {
      const ri = spec.labels.indexOf(spec.right);
      if (ri >= 0 && allPts.length >= 3) {
        const c = allPts[ri];
        const others = allPts.filter((_, idx) => idx !== ri).slice(0, 2);
        const u = norm(sub(others[0], c)), v = norm(sub(others[1], c));
        const s = 0.5;
        const p0 = [c[0] + u[0] * s, c[1] + u[1] * s] as [number, number];
        const p1 = [c[0] + u[0] * s + v[0] * s, c[1] + u[1] * s + v[1] * s] as [number, number];
        const p2 = [c[0] + v[0] * s, c[1] + v[1] * s] as [number, number];
        shapes.push(
          <polyline
            key="rt"
            points={`${gx(p0[0])},${gy(p0[1])} ${gx(p1[0])},${gy(p1[1])} ${gx(p2[0])},${gy(p2[1])}`}
            fill="none"
            stroke="#e8590c"
            strokeWidth={1.5}
          />
        );
      }
    }
  } else if (spec.type === "circle" && spec.center) {
    const c = spec.center;
    shapes.push(
      <circle
        key="circ"
        cx={gx(c[0])}
        cy={gy(c[1])}
        r={radius * scale}
        fill="#eff4ff"
        stroke="#3366ff"
        strokeWidth={2.5}
      />
    );
    shapes.push(<circle key="ctr" cx={gx(c[0])} cy={gy(c[1])} r={3} fill="#1e293b" />);
    // radius line
    shapes.push(
      <line key="rad" x1={gx(c[0])} y1={gy(c[1])} x2={gx(c[0] + radius)} y2={gy(c[1])} stroke="#e8590c" strokeWidth={2} />
    );
    if (radius)
      labelEls.push(
        <text key="rl" x={gx(c[0] + radius / 2)} y={gy(c[1]) - 6} fontSize="12" fill="#e8590c">
          r = {radius}
        </text>
      );
  }

  return (
    <figure className="math-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={spec.title || "figure"}>
        {shapes}
        {labelEls}
      </svg>
      {spec.title && <figcaption>{spec.title}</figcaption>}
    </figure>
  );
}

function sub(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}
function norm(a: [number, number]): [number, number] {
  const m = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / m, a[1] / m];
}

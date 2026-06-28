import { readFileSync, writeFileSync } from "fs";
import { shuffleQuestions } from "../src/lib/shuffle";

type Lesson = {
  id: string;
  title: string;
  questions: any[];
};

const raw = readFileSync(new URL("./backfill-data.json", import.meta.url), "utf8");
const lessons: Lesson[] = JSON.parse(raw);

const out: { id: string; title: string; before: string[]; after: string[]; questions: any[] }[] = [];

for (let li = 0; li < lessons.length; li++) {
  const l = lessons[li];
  const qs = Array.isArray(l.questions) ? l.questions : [];
  const before = qs.map((q) => String(q.answer || "").trim().charAt(0).toUpperCase());
  const shuffled = shuffleQuestions(qs, `${l.title}#${li}`);
  const after = shuffled.map((q: any) => String(q.answer || "").trim().charAt(0).toUpperCase());
  out.push({ id: l.id, title: l.title, before, after, questions: shuffled });
}

// Report
for (const o of out) {
  console.log(`\n=== ${o.title} (${o.id}) ===`);
  console.log(`  before: ${o.before.join(",")}`);
  console.log(`  after:  ${o.after.join(",")}`);
  const allSame = o.after.every((x) => x === o.after[0]);
  // adjacency check
  let adj = false;
  for (let i = 1; i < o.after.length; i++) if (o.after[i] === o.after[i - 1]) adj = true;
  console.log(`  all-same-letter: ${allSame}  has-adjacent-same: ${adj}`);
}

// Emit a JSON file mapping id -> questions for the SQL update step
const map: Record<string, any[]> = {};
for (const o of out) map[o.id] = o.questions;
writeFileSync(new URL("./backfill-output.json", import.meta.url), JSON.stringify(map, null, 2), "utf8");
console.log("\nWrote scripts/backfill-output.json");

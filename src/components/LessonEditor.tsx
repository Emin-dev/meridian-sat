"use client";

import { useState } from "react";
import { Button, Card, Input, Textarea, Select, Badge } from "@/components/ui";
import Markdown from "@/components/Markdown";
import type { Lesson, Question } from "@/lib/supabase";
import { Plus, Trash2, Eye, Save, X } from "lucide-react";

// Full admin lesson editor — edit EVERYTHING the student sees.
export default function LessonEditor({
  lesson,
  onSave,
  onClose,
}: {
  lesson: Lesson;
  onSave: (l: Partial<Lesson>) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Lesson>({ ...lesson });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Lesson>(key: K, val: Lesson[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function setQ(i: number, patch: Partial<Question>) {
    const qs = [...(draft.questions || [])];
    qs[i] = { ...qs[i], ...patch };
    set("questions", qs);
  }
  function setChoice(qi: number, ci: number, val: string) {
    const qs = [...(draft.questions || [])];
    const choices = [...(qs[qi].choices || [])];
    choices[ci] = val;
    qs[qi] = { ...qs[qi], choices };
    set("questions", qs);
  }
  function addQuestion() {
    set("questions", [
      ...(draft.questions || []),
      { prompt: "", choices: ["A) ", "B) ", "C) ", "D) "], answer: "A", explanation: "" },
    ]);
  }
  function removeQuestion(i: number) {
    set(
      "questions",
      (draft.questions || []).filter((_, idx) => idx !== i)
    );
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      title: draft.title,
      section: draft.section,
      topic: draft.topic,
      difficulty: draft.difficulty,
      content: draft.content,
      questions: draft.questions,
      study_plan: draft.study_plan,
      status: draft.status,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-paper shadow-pop animate-fadeUp">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Edit lesson
            </p>
            <h2 className="font-bold text-ink">{draft.title || "Untitled"}</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPreview((p) => !p)}>
              <Eye size={16} /> {preview ? "Editing" : "Preview"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          {preview ? (
            <Card className="p-6">
              <div className="flex gap-2">
                <Badge tone={draft.section === "Math" ? "brand" : "amber"}>
                  {draft.section}
                </Badge>
                <Badge tone="slate">{draft.difficulty}</Badge>
              </div>
              <h1 className="mt-3 font-display text-2xl font-extrabold text-ink">
                {draft.title}
              </h1>
              <div className="mt-4">
                <Markdown>{draft.content}</Markdown>
              </div>
              {(draft.questions || []).map((q, i) => (
                <div key={i} className="mt-5 rounded-xl bg-paper p-4">
                  <div className="font-semibold text-ink">
                    Q{i + 1}. <Markdown>{q.prompt}</Markdown>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-ink-soft">
                    {q.choices?.map((c, ci) => (
                      <li key={ci}>{c}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm font-semibold text-green-700">
                    Answer: {q.answer}
                  </p>
                </div>
              ))}
            </Card>
          ) : (
            <>
              {/* meta */}
              <Card className="space-y-3 p-5">
                <Field label="Title">
                  <Input value={draft.title} onChange={(v) => set("title", v)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Section">
                    <Select
                      value={draft.section}
                      onChange={(v) => set("section", v)}
                      options={[
                        { value: "Math", label: "Math" },
                        { value: "Reading and Writing", label: "Reading and Writing" },
                      ]}
                    />
                  </Field>
                  <Field label="Difficulty">
                    <Select
                      value={draft.difficulty}
                      onChange={(v) => set("difficulty", v)}
                      options={[
                        { value: "easy", label: "Easy" },
                        { value: "medium", label: "Medium" },
                        { value: "hard", label: "Hard" },
                      ]}
                    />
                  </Field>
                </div>
                <Field label="Topic">
                  <Input value={draft.topic} onChange={(v) => set("topic", v)} />
                </Field>
                <Field label="Status (controls student visibility)">
                  <Select
                    value={draft.status}
                    onChange={(v) => set("status", v)}
                    options={[
                      { value: "published", label: "Published (visible to student)" },
                      { value: "draft", label: "Draft (hidden)" },
                    ]}
                  />
                </Field>
              </Card>

              {/* concept content */}
              <Card className="space-y-2 p-5">
                <Field label="Concept explanation (Markdown + LaTeX)">
                  <Textarea
                    value={draft.content}
                    onChange={(v) => set("content", v)}
                    rows={10}
                  />
                </Field>
                <p className="text-xs text-ink-muted">
                  Math: use \( ... \) inline and \[ ... \] for display equations.
                </p>
              </Card>

              {/* study plan */}
              <Card className="p-5">
                <Field label="Study plan (Markdown)">
                  <Textarea
                    value={draft.study_plan}
                    onChange={(v) => set("study_plan", v)}
                    rows={6}
                  />
                </Field>
              </Card>

              {/* questions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
                    Practice questions
                  </h3>
                  <Button variant="soft" onClick={addQuestion}>
                    <Plus size={16} /> Add
                  </Button>
                </div>
                {(draft.questions || []).map((q, i) => (
                  <Card key={i} className="space-y-3 p-5">
                    <div className="flex items-center justify-between">
                      <Badge tone="brand">Question {i + 1}</Badge>
                      <Button variant="danger" onClick={() => removeQuestion(i)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <Field label="Prompt">
                      <Textarea
                        value={q.prompt}
                        onChange={(v) => setQ(i, { prompt: v })}
                        rows={2}
                      />
                    </Field>
                    <Field label="Choices">
                      <div className="space-y-2">
                        {(q.choices || []).map((c, ci) => (
                          <Input
                            key={ci}
                            value={c}
                            onChange={(v) => setChoice(i, ci, v)}
                          />
                        ))}
                      </div>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Correct answer (letter)">
                        <Select
                          value={q.answer}
                          onChange={(v) => setQ(i, { answer: v })}
                          options={["A", "B", "C", "D"].map((x) => ({
                            value: x,
                            label: x,
                          }))}
                        />
                      </Field>
                    </div>
                    <Field label="Explanation">
                      <Textarea
                        value={q.explanation}
                        onChange={(v) => setQ(i, { explanation: v })}
                        rows={2}
                      />
                    </Field>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-white px-5 py-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}

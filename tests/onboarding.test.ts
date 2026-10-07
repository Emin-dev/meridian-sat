import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { state, generate, budget, db } = vi.hoisted(() => {
  const state = { student: {} as any, draft: {} as any, created: true };
  const generate = vi.fn(), budget = vi.fn();
  const db = {
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === "finish_student_onboarding") {
        const matches = state.draft.id === args.p_request_id && state.draft.status === "pending" && state.draft.version === args.p_request_version;
        if (matches) Object.assign(state.draft, args.p_package, { version: state.draft.version + 1 });
        return { data: matches, error: null };
      }
      return { data: { student: state.student, created: state.created, request_id: "draft", request_version: 1 }, error: null };
    }),
    from: (table: string) => {
      const filters: [string, any][] = [];
      let patch: any = null;
      const q: any = {
        select: () => q,
        eq: (key: string, value: any) => { filters.push([key, value]); return q; },
        update: (value: any) => { patch = value; return q; },
        single: () => q,
        then: (resolve: any) => {
          const row = table === "students" ? state.student : state.draft;
          const match = filters.every(([key, value]) => row[key] === value);
          if (patch && match) Object.assign(row, patch);
          return Promise.resolve(resolve({ data: match ? { ...row, students: state.student } : null, error: null }));
        },
      };
      return q;
    },
  };
  return { state, generate, budget, db };
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db }));
vi.mock("@/lib/lessongen", () => ({ generateDraftPackage: generate, fallbackPackage: () => ({ lessons: [], study_plan: "fallback" }) }));
vi.mock("@/lib/ratelimit", () => ({ checkAndConsume: budget }));
vi.mock("@/lib/studentauth", () => ({ requireStudent: async () => null }));
vi.mock("@/lib/adminauth", () => ({ requireAdmin: () => null }));
import { POST } from "@/app/api/onboarding/route";
import { PATCH } from "@/app/api/lesson-requests/[id]/route";
const id = "00000000-0000-4000-8000-000000000001";
const req = (body: any) => new NextRequest("http://localhost/api/onboarding", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  state.student = { id, status: "preparing", notes: "private", access_code: "private", onboarded: true };
  state.draft = { id: "draft", student_id: id, status: "pending", version: 1, study_plan: "fallback", lessons: [] };
  state.created = true;
  budget.mockResolvedValue({ allowed: true });
});
describe("onboarding personalization races", () => {
  it("does not overwrite a teacher edit made while generation is in flight", async () => {
    let finish!: (value: any) => void;
    generate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = POST(req({ studentId: id, answers: {} }));
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    const edited = await PATCH(req({ action: "edit", version: 1, study_plan: "Teacher's reviewed plan" }), { params: Promise.resolve({ id: "draft" }) });
    expect(edited.status).toBe(200); expect(state.draft.version).toBe(2);
    finish({ lessons: [{}], study_plan: "Delayed generated plan", ai_summary: "test", notes: "test" });
    const response = await pending;
    expect(state.draft.study_plan).toBe("Teacher's reviewed plan");
    const data = await response.json();
    expect(data.student).not.toHaveProperty("notes"); expect(data.student).not.toHaveProperty("access_code");
  });
  it("does not change a draft approved while generation is in flight", async () => {
    let finish!: (value: any) => void;
    generate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = POST(req({ studentId: id, answers: {} }));
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    state.draft.status = "approved";
    finish({ lessons: [{}], study_plan: "Delayed generated plan" });
    await pending;
    expect(state.draft.study_plan).toBe("fallback");
  });
  it.each(["denied", "unavailable"])("keeps the fallback without invoking AI when budget is %s", async mode => {
    if (mode === "denied") budget.mockResolvedValue({ allowed: false });
    else budget.mockRejectedValue(new Error("synthetic storage failure"));
    expect((await POST(req({ studentId: id, answers: {} }))).status).toBe(200);
    expect(generate).not.toHaveBeenCalled(); expect(state.draft.study_plan).toBe("fallback");
  });
  it("does not regenerate a repeated onboarding submission", async () => {
    state.created = false;
    expect((await POST(req({ studentId: id, answers: {} }))).status).toBe(200);
    expect(budget).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled();
  });
});

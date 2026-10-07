import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db, response, calls } = vi.hoisted(() => {
  const calls: [string, ...unknown[]][] = [];
  const response = { data: null as any, error: null as any };
  const chain: Record<string, any> = {};
  for (const name of ["select", "eq", "in", "order", "limit", "insert", "update", "single", "maybeSingle", "delete"])
    chain[name] = vi.fn((...args: unknown[]) => { calls.push([name, ...args]); return chain; });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(response));
  const db = { from: vi.fn((table: string) => { calls.push(["from", table]); return chain; }), rpc: vi.fn() };
  return { db, response, calls };
});
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db }));
vi.mock("@/lib/insights", () => ({ recomputeEngagement: vi.fn() }));
vi.mock("@/lib/studentauth", () => ({
  requireStudent: async (req: NextRequest, id: string) =>
    req.headers.get("x-student-token") === id || req.headers.get("x-admin-token") === "admin" ? null : new Response(null, { status: 401 }),
}));
vi.mock("@/lib/adminauth", () => ({
  requireAdmin: (req: NextRequest) => req.headers.get("x-admin-token") === "admin" ? null : new Response(null, { status: 401 }),
}));
import * as events from "@/app/api/events/route";
import * as lessons from "@/app/api/lessons/route";
import * as lesson from "@/app/api/lessons/[id]/route";
import * as students from "@/app/api/students/[id]/route";
import * as tools from "@/app/api/student-tools/route";
import * as progress from "@/app/api/progress/route";
import * as media from "@/app/api/media-requests/route";
const id = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const request = (path: string, headers: Record<string,string | undefined> = {}, body?: unknown) => new NextRequest(`http://localhost/api/${path}`, {
  headers: Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")), ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
});
beforeEach(() => { calls.length = 0; response.data = []; response.error = null; vi.clearAllMocks(); });
describe("event boundaries", () => {
  it.each([{}, { "x-student-token": id }])("keeps event history teacher-only", async headers => {
    expect((await events.GET(request("events", headers))).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and other-student writes before storage", async () => {
    for (const headers of [{}, { "x-student-token": other }])
      expect((await events.POST(request("events", headers, { studentId: id, type: "login" }))).status).toBe(401);
    expect(db.from).not.toHaveBeenCalled();
  });
  it("accepts a synthetic owner's supported event", async () => {
    expect((await events.POST(request("events", { "x-student-token": id }, { studentId: id, type: "login" }))).status).toBe(200);
    expect(calls.some(c => c[0] === "insert")).toBe(true);
  });
  it.each([{ type: "lessons_ready" }, { type: "login", durationMs: -1 }, { type: "login", meta: [] }, { batch: Array(26).fill({ type: "login" }) }])("rejects forged or oversized event details", async detail => {
    expect((await events.POST(request("events", { "x-student-token": id }, { studentId: id, ...detail }))).status).toBe(400);
    expect(calls.some(c => c[0] === "insert")).toBe(false);
  });
});
describe("student and publication boundaries", () => {
  it("strips teacher-only student fields", async () => {
    response.data = { id, status: "preparing", notes: "private", access_code: "credential", study_plan: "draft" };
    const res = await students.GET(request(`students/${id}`, { "x-student-token": id }), { params: Promise.resolve({ id }) });
    const data = await res.json();
    expect(data.student).not.toHaveProperty("notes"); expect(data.student).not.toHaveProperty("access_code"); expect(data.student.study_plan).toBe("");
  });
  it("rejects self-activation without writing", async () => {
    const res = await students.PATCH(request(`students/${id}`, { "x-student-token": id }, { status: "active", onboarded: true }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(403); expect(calls.some(c => c[0] === "update")).toBe(false);
  });
  it("keeps administrator edits available", async () => {
    response.data = { id, status: "active" };
    expect((await students.PATCH(request(`students/${id}`, { "x-admin-token": "admin" }, { status: "active" }), { params: Promise.resolve({ id }) })).status).toBe(200);
    expect(calls).toContainEqual(["update", { status: "active" }]);
  });
  it("enforces published-only student lists in the database query", async () => {
    await lessons.GET(request(`lessons?studentId=${id}`, { "x-student-token": id }));
    expect(calls).toContainEqual(["eq", "status", "published"]);
  });
  it("retains the administrator draft list", async () => {
    await lessons.GET(request(`lessons?studentId=${id}`, { "x-admin-token": "admin" }));
    expect(calls).not.toContainEqual(["eq", "status", "published"]);
  });
  it.each([undefined, other])("rejects unauthenticated or other-owner lesson reads", async token => {
    response.data = { id: other, student_id: id, status: "published", content: "private" };
    const res = await lesson.GET(request(`lessons/${other}`, token ? { "x-student-token": token } : {}), { params: Promise.resolve({ id: other }) });
    expect(res.status).toBe(401);
  });
  it("hides drafts even from their student owner", async () => {
    response.data = { id: other, student_id: id, status: "draft", content: "private" };
    expect((await lesson.GET(request(`lessons/${other}`, { "x-student-token": id }), { params: Promise.resolve({ id: other }) })).status).toBe(404);
  });
  it("ignores a student's requested pending-tool filter", async () => {
    await tools.GET(request(`student-tools?studentId=${id}&status=pending`, { "x-student-token": id }));
    expect(calls).toContainEqual(["eq", "status", "approved"]);
    expect(calls).not.toContainEqual(["eq", "status", "pending"]);
    expect(String(calls.find(c => c[0] === "select")?.[1])).not.toContain("access_code");
  });
  it("does not join credentials into student media requests", async () => {
    await media.GET(request(`media-requests?studentId=${id}`, { "x-student-token": id }));
    expect(String(calls.find(c => c[0] === "select")?.[1])).not.toContain("access_code");
  });
  it("rejects cross-owner progress before writing", async () => {
    response.data = [];
    expect((await progress.POST(request("progress", { "x-student-token": id }, { student_id: id, lesson_id: other }))).status).toBe(400);
    expect(calls).toContainEqual(["eq", "student_id", id]);
    expect(calls.some(c => c[0] === "insert")).toBe(false);
  });
});

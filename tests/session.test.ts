import { describe, it, expect, afterEach, vi } from "vitest";
import { issueSession, validSession, SESSION_SECONDS } from "@/lib/session";
import { studentView } from "@/lib/student-view";
import { adminToken, isValidAdminToken } from "@/lib/adminauth";

const key = "synthetic-test-key-only";
describe("short-lived sessions", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("rejects absent configuration", () => {
    expect(() => issueSession("s", "")).toThrow();
    expect(validSession("x", "s", "")).toBe(false);
  });
  it("issues distinct tokens for independent logins", () => {
    expect(issueSession("s", key)).not.toBe(issueSession("s", key));
  });
  it("binds subject, signing key and expiry", () => {
    const now = 1700000000000, t = issueSession("student:a", key, now);
    expect(validSession(t, "student:a", key, now)).toBe(true);
    expect(validSession(t, "student:b", key, now)).toBe(false);
    expect(validSession(t, "student:a", "rotated", now)).toBe(false);
    expect(validSession(t, "student:a", key, now + SESSION_SECONDS * 1000)).toBe(false);
  });
  it.each(["", "old-static-token", "a.b.c", "a.b", "x".repeat(2049)])("rejects malformed token %s", t => {
    expect(validSession(t, "student:a", key)).toBe(false);
  });
  it("invalidates admin sessions after password rotation", () => {
    vi.stubEnv("ADMIN_PASSWORD", key);
    const t = adminToken();
    expect(isValidAdminToken(t)).toBe(true);
    vi.stubEnv("ADMIN_PASSWORD", "changed-test-password");
    expect(isValidAdminToken(t)).toBe(false);
  });
});
describe("student response allowlist", () => {
  const student = { id: "a", name: "Synthetic learner", status: "preparing", access_code: "secret", notes: "private", labels: ["private"], tags: ["staff"], insights: {}, recommendations: {}, future_private_column: "hidden", study_plan: "draft", ai_summary: "draft summary" };
  it("omits credentials, staff notes and unknown future columns", () => {
    const view = studentView(student);
    for (const field of ["access_code", "notes", "labels", "tags", "insights", "recommendations", "future_private_column"]) expect(view).not.toHaveProperty(field);
    expect(view.name).toBe(student.name);
  });
  it("withholds unpublished plans and summaries", () => {
    expect(studentView(student).study_plan).toBe("");
    expect(studentView(student).ai_summary).toBe("");
    expect(studentView({ ...student, status: "active" }).study_plan).toBe("draft");
  });
});

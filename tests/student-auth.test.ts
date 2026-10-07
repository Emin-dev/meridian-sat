import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) }) }) }));
import { studentToken, isValidStudentToken } from "@/lib/studentauth";
describe("student session revocation", () => {
  beforeEach(() => { vi.stubEnv("STUDENT_TOKEN_SECRET", "synthetic-signing-secret"); lookup.mockResolvedValue({ data: { access_code: "first" }, error: null }); });
  afterEach(() => vi.unstubAllEnvs());
  it("binds tokens to the current access code and owning student", async () => {
    const t = studentToken("a", "first");
    expect(await isValidStudentToken("a", t)).toBe(true);
    expect(await isValidStudentToken("b", t)).toBe(false);
    lookup.mockResolvedValue({ data: { access_code: "rotated" }, error: null });
    expect(await isValidStudentToken("a", t)).toBe(false);
  });
  it("fails closed for removed students and storage errors", async () => {
    const t = studentToken("a", "first");
    lookup.mockResolvedValue({ data: null, error: null });
    expect(await isValidStudentToken("a", t)).toBe(false);
    lookup.mockRejectedValue(new Error("synthetic failure"));
    expect(await isValidStudentToken("a", t)).toBe(false);
  });
});

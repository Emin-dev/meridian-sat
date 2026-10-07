import { afterEach, expect, it, vi } from "vitest";
import { setStudentToken } from "@/lib/studentClient";
import { createTracker } from "@/lib/track";
afterEach(() => { setStudentToken(null); vi.unstubAllGlobals(); });
it("preserves the student's authorization on keepalive activity requests", () => {
  const fetch = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal("fetch", fetch);
  setStudentToken("synthetic-token");
  const tracker = createTracker("synthetic-id");
  tracker.track("login"); tracker.dispose();
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/events");
  expect(options.headers.get("x-student-token")).toBe("synthetic-token");
  expect(options.keepalive).toBe(true);
});

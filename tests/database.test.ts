import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const db = new PGlite();
const id = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("supabase/schema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261007_security_boundaries.sql", "utf8"));
  await db.query("insert into students(id,name,access_code) values($1,'Synthetic learner','synthetic-only')", [id]);
}, 30000);
afterAll(() => db.close());
async function consume(commit = true) {
  return (await db.query<{ value: any }>("select consume_ai_usage($1, $2) as value", [id, commit])).rows[0].value;
}
describe("synthetic database security migration", () => {
  it("applies twice without destroying records", async () => {
    await db.exec(readFileSync("supabase/migrations/20261007_security_boundaries.sql", "utf8"));
    expect((await db.query("select id from students")).rows).toHaveLength(1);
  });
  it("enables RLS and denies public credentials direct table and RPC access", async () => {
    const tables = await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('students','lessons','login_attempts','ui_media')");
    expect(tables.rows.every(r => r.relrowsecurity)).toBe(true);
    await db.exec("set role anon");
    await expect(db.query("select * from students")).rejects.toThrow(/permission denied/);
    await expect(db.query("select consume_login_attempt('admin')")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
  });
  it("allows the server role to use quota RPCs", async () => {
    await db.exec("set role service_role");
    expect((await consume()).allowed).toBe(true);
    await db.exec("reset role");
  });
  it("does not lose simultaneous usage increments", async () => {
    await db.exec("update ai_usage set count=0,last_request_at=null,blocked_until=null");
    await Promise.all(Array.from({ length: 25 }, () => consume()));
    expect((await consume(false)).count).toBe(25);
  });
  it("enforces throttle and hard ceiling before spending", async () => {
    await db.exec("update ai_usage set count=99,last_request_at=null,blocked_until=null");
    expect((await consume()).count).toBe(100);
    expect((await consume()).allowed).toBe(false);
    await db.exec("update ai_usage set count=200,last_request_at=null,blocked_until=null");
    const blocked = await consume();
    expect(blocked.allowed).toBe(false); expect(blocked.count).toBe(200); expect(blocked.blocked_until).toBeTruthy();
    expect((await consume()).count).toBe(200);
  });
  it("adds bonuses atomically and clears an active block", async () => {
    await Promise.all(Array.from({ length: 5 }, () => db.query("select grant_ai_bonus($1,10)", [id])));
    const status = await consume(false);
    expect(status.bonus).toBe(50); expect(status.blocked_until).toBeNull(); expect(status.allowed).toBe(true);
    await expect(db.query("select grant_ai_bonus($1,-1)", [id])).rejects.toThrow(/Invalid bonus/);
  });
  it("durably bounds administrator login attempts and resets an expired window", async () => {
    for (let n = 0; n < 20; n++) expect((await db.query<{ allowed: boolean }>("select consume_login_attempt('admin') as allowed")).rows[0].allowed).toBe(true);
    expect((await db.query<{ allowed: boolean }>("select consume_login_attempt('admin') as allowed")).rows[0].allowed).toBe(false);
    await db.exec("update login_attempts set started_at = now() - interval '16 minutes'");
    expect((await db.query<{ allowed: boolean }>("select consume_login_attempt('admin') as allowed")).rows[0].allowed).toBe(true);
  });
  it("claims onboarding once and files a fallback atomically", async () => {
    const args = [id, { goal: "synthetic" }, { study_plan: "test plan", lessons: [] }];
    const query = "select begin_student_onboarding($1,$2,$3) as value";
    const first = (await db.query<{ value: any }>(query, args)).rows[0].value;
    const repeated = (await db.query<{ value: any }>(query, args)).rows[0].value;
    expect(first.created).toBe(true); expect(first.student.status).toBe("preparing"); expect(repeated.created).toBe(false);
    expect((await db.query("select * from lesson_requests")).rows).toHaveLength(1);
    await db.exec("update students set status='active'");
    expect((await db.query<{ value: any }>(query, args)).rows[0].value.student.status).toBe("active");
  });
  it("finalizes a current draft without replacing concurrent teacher profile edits", async () => {
    await db.exec("update students set status='preparing',target_score=1450,weak_areas='{}'");
    const draft = (await db.query<{ id: string }>("select id from lesson_requests limit 1")).rows[0];
    const payload = { study_plan: "Generated plan", lessons: [], weak_areas: ["Algebra"], target_score: 1500 };
    const args = [draft.id, 1, payload, { weak_areas: [], target_score: 1400 }];
    const query = "select finish_student_onboarding($1,$2,$3,$4) as applied";
    expect((await db.query<{ applied: boolean }>(query, args)).rows[0].applied).toBe(true);
    const student = (await db.query<{ target_score: number; weak_areas: string[] }>("select target_score,weak_areas from students")).rows[0];
    expect(student.target_score).toBe(1450); expect(student.weak_areas).toEqual(["Algebra"]);
    expect((await db.query<{ applied: boolean }>(query, args)).rows[0].applied).toBe(false);
    expect((await db.query<{ version: number }>("select version from lesson_requests")).rows[0].version).toBe(2);
  });

  it("publishes exactly the reviewed revision once and rejects stale approval", async () => {
    const draft = (await db.query<{ id: string; version: number }>("select id,version from lesson_requests limit 1")).rows[0];
    await db.query("update lesson_requests set lessons=$1 where id=$2", [[{ title: "Synthetic lesson", questions: [] }], draft.id]);
    const stale = await db.query<{ result: any }>("select approve_lesson_request($1,$2) as result", [draft.id, draft.version - 1]);
    expect(stale.rows[0].result.conflict).toBe(true);
    const approved = await db.query<{ result: any }>("select approve_lesson_request($1,$2) as result", [draft.id, draft.version]);
    expect(approved.rows[0].result.published).toBe(1);
    expect(approved.rows[0].result.request.status).toBe("approved");
    const again = await db.query<{ result: any }>("select approve_lesson_request($1,$2) as result", [draft.id, draft.version]);
    expect(again.rows[0].result.conflict).toBe(true);
    expect((await db.query("select id from lessons")).rows).toHaveLength(1);
    expect((await db.query<{ status: string; study_plan: string }>("select status,study_plan from students")).rows[0]).toEqual({ status: "active", study_plan: "Generated plan" });
    const late = await db.query<{ applied: boolean }>("select finish_student_onboarding($1,$2,$3,$4) as applied", [draft.id, draft.version, { lessons: [], study_plan: "Too late" }, {}]);
    expect(late.rows[0].applied).toBe(false);
  });

});

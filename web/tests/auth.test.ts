import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { attemptLogin, LOCK_SECONDS } from "@/lib/auth/login";
import { en, bn } from "@/lib/i18n/dict";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await db()`insert into users (username, display_name, role, password_hash)
             values ('teacher1', 'T', 'teacher', ${await hashPassword("correct-horse-1")})`;
});

describe("Level 4 login lockout", () => {
  it("stores passwords as argon2id hashes", async () => {
    const [u] = await db()`select password_hash from users`;
    expect(u.password_hash).toMatch(/^\$argon2id\$/);
  });

  it("5 wrong passwords lock for 30 s — even the correct password — then it is accepted", async () => {
    for (let i = 1; i <= 4; i++) expect(await attemptLogin("teacher1", "wrong", null, null)).toEqual({ ok: false, reason: "invalid" });
    expect(await attemptLogin("teacher1", "wrong", null, null)).toEqual({ ok: false, reason: "locked", retryAfterS: LOCK_SECONDS });
    const r = await attemptLogin("teacher1", "correct-horse-1", null, null);
    expect(r).toMatchObject({ ok: false, reason: "locked" });
    // Simulate the 30 s passing.
    await db()`update users set locked_until = now() - interval '1 second'`;
    expect(await attemptLogin("TEACHER1 ", "correct-horse-1", null, null)).toMatchObject({ ok: true });
    const hist = await db()`select success, reason from login_attempts order by id`;
    expect(hist.map((h) => h.reason)).toEqual(["bad_password", "bad_password", "bad_password", "bad_password", "bad_password", "locked", "ok"]);
  });

  it("a successful login resets the consecutive-failure count", async () => {
    for (let i = 0; i < 4; i++) await attemptLogin("teacher1", "wrong", null, null);
    expect(await attemptLogin("teacher1", "correct-horse-1", null, null)).toMatchObject({ ok: true });
    for (let i = 0; i < 4; i++) expect(await attemptLogin("teacher1", "wrong", null, null)).toMatchObject({ reason: "invalid" });
  });

  it("unknown users get the same generic answer and are logged", async () => {
    expect(await attemptLogin("nobody", "x", "1.2.3.4", "ua")).toEqual({ ok: false, reason: "invalid" });
    const [h] = await db()`select username, user_id, reason, ip from login_attempts`;
    expect(h).toEqual({ username: "nobody", user_id: null, reason: "unknown_user", ip: "1.2.3.4" });
  });

  it("concurrent wrong passwords cannot skip the lock", async () => {
    await Promise.all(Array.from({ length: 5 }, () => attemptLogin("teacher1", "wrong", null, null)));
    expect(await attemptLogin("teacher1", "correct-horse-1", null, null)).toMatchObject({ ok: false, reason: "locked" });
  });
});

describe("i18n", () => {
  it("English and Bangla define exactly the same keys, all non-empty", () => {
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(bn)) expect(v.trim().length).toBeGreaterThan(0);
  });
  it("placeholders match between languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(bn[k])).toBe(ph(en[k]));
  });
});
void vi;

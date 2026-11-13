/**
 * Login with lockout (Level 4): after 5 wrong passwords in a row the account is
 * locked for 30 seconds — even the correct password is refused. Every attempt is
 * recorded in login_attempts (time, user, success or failure).
 */
import { db } from "../db";
import { dummyVerify, verifyPassword } from "./password";

export const MAX_FAILED = 5;
export const LOCK_SECONDS = 30;

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid" | "locked" | "inactive"; retryAfterS?: number };

export async function attemptLogin(usernameRaw: string, password: string, ip: string | null, ua: string | null): Promise<LoginResult> {
  const username = usernameRaw.trim().toLowerCase().slice(0, 64);
  const record = (userId: string | null, success: boolean, reason: string) =>
    db()`insert into login_attempts (username, user_id, success, reason, ip, user_agent)
         values (${username}, ${userId}, ${success}, ${reason}, ${ip}, ${ua?.slice(0, 200) ?? null})`;

  const [u] = await db()<{ id: string; password_hash: string; is_active: boolean; locked_s: number }[]>`
    select id, password_hash, is_active,
           greatest(0, ceil(extract(epoch from (locked_until - now()))))::int as locked_s
      from users where username = ${username}`;
  if (!u) {
    await dummyVerify(password);
    await record(null, false, "unknown_user");
    return { ok: false, reason: "invalid" };
  }
  if (u.locked_s > 0) {
    await record(u.id, false, "locked");
    return { ok: false, reason: "locked", retryAfterS: u.locked_s };
  }
  const good = await verifyPassword(u.password_hash, password);
  if (!u.is_active) {
    await record(u.id, false, "inactive");
    return { ok: false, reason: "inactive" };
  }
  if (good) {
    await db()`update users set failed_attempts = 0, locked_until = null where id = ${u.id}`;
    await record(u.id, true, "ok");
    return { ok: true, userId: u.id };
  }
  // Atomic counter: the 5th consecutive failure locks the account and resets the count.
  const [after] = await db()<{ locked: boolean }[]>`
    update users set
      failed_attempts = case when failed_attempts + 1 >= ${MAX_FAILED} then 0 else failed_attempts + 1 end,
      locked_until    = case when failed_attempts + 1 >= ${MAX_FAILED} then now() + make_interval(secs => ${LOCK_SECONDS}) else locked_until end
     where id = ${u.id}
    returning locked_until > now() as locked`;
  await record(u.id, false, "bad_password");
  if (after?.locked) return { ok: false, reason: "locked", retryAfterS: LOCK_SECONDS };
  return { ok: false, reason: "invalid" };
}

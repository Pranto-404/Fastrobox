import { cookies } from "next/headers";
import { db } from "../db";
import { config } from "../env";
import { newToken, sha256Hex } from "../crypto";

export const SESSION_COOKIE = "frx_session";

export type Role = "admin" | "teacher" | "student" | "guardian";

export interface SessionUser {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  preferred_locale: "en" | "bn";
  session_id: string;
}

export async function createSession(userId: string, ip: string | null, ua: string | null) {
  const token = newToken("frx_s");
  const ttlH = config().SESSION_TTL_HOURS;
  await db()`
    insert into sessions (user_id, token_hash, ip, user_agent, expires_at)
    values (${userId}, ${sha256Hex(token)}, ${ip}, ${ua?.slice(0, 200) ?? null}, now() + make_interval(hours => ${ttlH}))`;
  return { token, maxAge: ttlH * 3600 };
}

export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !/^frx_s_[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const rows = await db()<SessionUser[]>`
    update sessions s set last_seen_at = now()
      from users u
     where s.token_hash = ${sha256Hex(token)} and s.revoked_at is null and s.expires_at > now()
       and u.id = s.user_id and u.is_active
    returning u.id, u.username, u.display_name, u.role, u.preferred_locale, s.id as session_id`;
  return rows[0] ?? null;
}

/** Current user from the session cookie (server components and route handlers). */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function revokeSession(sessionId: string) {
  await db()`update sessions set revoked_at = now() where id = ${sessionId}`;
}

export function cookieSecure(req?: Request): boolean {
  const mode = config().COOKIE_SECURE;
  if (mode !== "auto") return mode === "true";
  if (req) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    return proto === "https";
  }
  return process.env.NODE_ENV === "production";
}

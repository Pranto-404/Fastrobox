import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { attemptLogin } from "@/lib/auth/login";
import { cookieSecure, createSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.strictObject({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { username, password } = body.parse(await readJson(req, 2048));
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");
  const r = await attemptLogin(username, password, ip, ua);
  if (!r.ok) {
    if (r.reason === "locked") {
      throw new ApiError(423, "account_locked", "Too many wrong passwords. Try again later.", { retry_after_s: r.retryAfterS });
    }
    throw new ApiError(401, "invalid_credentials", "Wrong username or password");
  }
  const s = await createSession(r.userId, ip, ua);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.token, {
    httpOnly: true, sameSite: "lax", secure: cookieSecure(req), path: "/", maxAge: s.maxAge,
  });
  return res;
});

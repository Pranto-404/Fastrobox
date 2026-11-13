import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/http";
import { currentUser, revokeSession, SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const u = await currentUser();
  if (u) await revokeSession(u.session_id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});

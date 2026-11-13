import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertSameOrigin, readJson, route } from "@/lib/http";
import { currentUser } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/i18n";

export const runtime = "nodejs";

/** English/Bangla switch. Works before login (cookie) and is remembered per user. */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const { locale } = z.strictObject({ locale: z.enum(["en", "bn"]) }).parse(await readJson(req, 256));
  const u = await currentUser();
  if (u) await db()`update users set preferred_locale = ${locale} where id = ${u.id}`;
  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 365 * 86400 });
  return res;
});

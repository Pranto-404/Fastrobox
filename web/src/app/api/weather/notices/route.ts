import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";
import { serverEvent } from "@/lib/events";

export const runtime = "nodejs";

/** Admin adds a TEST notice (Level 6 judge check B5). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const b = z.strictObject({
    level: z.enum(["ADVISORY", "WARNING", "DANGER"]),
    message: z.string().trim().min(3).max(200),
    minutes: z.coerce.number().int().min(1).max(1440).default(60),
  }).parse(await readJson(req, 1024));
  const key = `${config().WEATHER_LATITUDE.toFixed(3)},${config().WEATHER_LONGITUDE.toFixed(3)}`;
  const id = await db().begin(async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      insert into weather_alerts (location_key, level, kind, origin, message, valid_from, valid_to, source, created_by)
      values (${key}, ${b.level}, 'TEST', 'test', ${`TEST: ${b.message}`}, now(), now() + make_interval(mins => ${b.minutes}), 'Admin test notice', ${user.id})
      returning id`;
    await serverEvent(tx, { deviceId: null, classroomId: null, roomId: null, type: "WEATHER_ALERT", severity: b.level === "DANGER" ? "critical" : "warning", detail: `${b.level} TEST: ${b.message}` });
    await audit(user.id, "weather.test_notice.add", { type: "weather_alert", id: row.id }, b, clientIp(req), tx);
    return row.id;
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
});

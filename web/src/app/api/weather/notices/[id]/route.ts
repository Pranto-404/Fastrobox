import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, assertSameOrigin, clientIp, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** Admin removes a TEST notice; dashboards and devices clear it on their next poll. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) throw new ApiError(404, "not_found", "Not found");
  const r = await db()`update weather_alerts set removed_at = now() where id = ${id} and origin = 'test' and removed_at is null returning id`;
  if (!r.length) throw new ApiError(404, "not_found", "No active TEST notice with this id");
  await audit(user.id, "weather.test_notice.remove", { type: "weather_alert", id }, {}, clientIp(req));
  return NextResponse.json({ ok: true });
});

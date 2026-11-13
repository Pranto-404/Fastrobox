import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, assertSameOrigin, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";
import { acknowledgeAlert } from "@/lib/alerts";
import { serverEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Single-winner acknowledgement (Level 8): exactly one ACK is recorded even if
 * several people press at the same moment; the others get 409 already_acknowledged
 * with who and when.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin", "teacher"]);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError(404, "not_found", "Not found");
  const [a] = await db()<{ classroom_id: string | null; device_id: string | null; alert_type: string; room_code: string | null }[]>`
    select a.classroom_id, a.device_id, a.alert_type, c.room_code from alerts a left join classrooms c on c.id = a.classroom_id where a.id = ${id}`;
  if (!a) throw new ApiError(404, "not_found", "Not found");
  if (a.classroom_id) await assertRoomAccess(user, a.classroom_id);
  else if (user.role !== "admin") throw new ApiError(403, "forbidden", "Not allowed");
  await db()`insert into alert_reads (alert_id, user_id) values (${id}, ${user.id}) on conflict do nothing`;
  const r = await acknowledgeAlert(id, user.id);
  const who = { by: r.name, at: r.acknowledged_at };
  if (!r.won) {
    throw new ApiError(409, "already_acknowledged", `Already acknowledged by ${r.name ?? "someone"}`, who);
  }
  await serverEvent(db(), { deviceId: a.device_id, classroomId: a.classroom_id, roomId: a.room_code, type: "ACK", detail: `alert=${id} ${a.alert_type} by=${user.username}` });
  return NextResponse.json({ ok: true, ...who });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertDeviceAccess } from "@/lib/access";
import { requestFireReset } from "@/lib/control";

export const runtime = "nodejs";

/** Teacher/Admin "Reset fire". Pending until the device confirms (door LOCKED). */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin", "teacher"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  await assertDeviceAccess(user, id);
  const commandId = await requestFireReset(id, user.id, clientIp(req));
  return NextResponse.json({ ok: true, command_id: commandId, status: "pending" }, { status: 202 });
});

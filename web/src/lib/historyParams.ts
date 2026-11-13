import { z } from "zod";
import { ApiError } from "./http";
import { assertRoomAccess } from "./access";
import type { SessionUser } from "./auth/session";

const MAX_RANGE_MS = 24 * 3600_000;

/** Parses ?room=&from=&to= (ISO), defaulting to the last 24 h; checks room access. */
export async function historyParams(req: Request, user: SessionUser, maxRangeMs = MAX_RANGE_MS) {
  const sp = new URL(req.url).searchParams;
  const room = sp.get("room") ?? "";
  if (!z.uuid().safeParse(room).success) throw new ApiError(422, "room_required", "room (classroom id) is required");
  await assertRoomAccess(user, room);
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(to.getTime() - MAX_RANGE_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new ApiError(422, "bad_range", "from must be before to");
  if (to.getTime() - from.getTime() > maxRangeMs) throw new ApiError(422, "range_too_long", "The period can be at most 24 hours");
  const types = (sp.get("types") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z_]{2,40}$/.test(s));
  return { room, from, to, types, csv: sp.get("format") === "csv" };
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
}

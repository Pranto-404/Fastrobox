import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { events, toCsv } from "@/lib/reports";
import { csvResponse, historyParams } from "@/lib/historyParams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const p = await historyParams(req, user, 31 * 24 * 3600_000);
  const rows = await events(p.room, p.from, p.to, p.types);
  if (p.csv) {
    return csvResponse(
      toCsv(rows as never, ["recorded_at", "event_type", "detail", "origin", "seq", "id", "device_uid", "is_offline_replay", "is_simulated"]),
      `events_${p.types.join("-") || "all"}.csv`,
    );
  }
  return NextResponse.json({ from: p.from, to: p.to, events: rows });
});

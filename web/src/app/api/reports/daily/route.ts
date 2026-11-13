import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";
import { dailyReport, toCsv } from "@/lib/reports";
import { csvResponse } from "@/lib/historyParams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const sp = new URL(req.url).searchParams;
  const room = sp.get("room") ?? "";
  const date = sp.get("date") ?? "";
  if (!z.uuid().safeParse(room).success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(422, "bad_params", "room and date (YYYY-MM-DD) are required");
  await assertRoomAccess(user, room);
  const r = await dailyReport(room, date);
  if (!r) throw new ApiError(404, "not_found", "Not found");
  if (sp.get("format") === "csv") {
    const rows = [
      { section: "temperature_c", min: r.temp.min, max: r.temp.max, avg: r.temp.avg, count: r.readings },
      { section: "humidity_pct", min: r.rh.min, max: r.rh.max, avg: r.rh.avg, count: r.readings },
      ...Object.entries(r.alarms).map(([k, v]) => ({ section: `alarms_${k}`, count: v })),
      ...Object.entries(r.attendance).map(([k, v]) => ({ section: `attendance_${k}`, count: v })),
    ];
    return csvResponse(toCsv(rows, ["section", "min", "max", "avg", "count"]), `daily_report_${r.room_code}_${date}.csv`);
  }
  return NextResponse.json(r);
});

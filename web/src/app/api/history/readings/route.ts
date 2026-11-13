import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { readings, toCsv } from "@/lib/reports";
import { csvResponse, historyParams } from "@/lib/historyParams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const p = await historyParams(req, user);
  const rows = await readings(p.room, p.from, p.to);
  if (p.csv) {
    return csvResponse(
      toCsv(rows as never, ["recorded_at", "device_uid", "seq", "temp_c", "rh", "heat_index_c", "status", "quality", "is_simulated"]),
      `readings_${p.from.toISOString().slice(0, 16)}_${p.to.toISOString().slice(0, 16)}.csv`,
    );
  }
  return NextResponse.json({ from: p.from, to: p.to, readings: rows });
});

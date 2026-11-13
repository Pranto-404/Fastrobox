import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDemoMode } from "@/lib/env";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { roomIdsFor } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const ids = await roomIdsFor(user);
  const status = new URL(req.url).searchParams.get("status");
  const all = ids === "all";
  const scope = all ? [] : ids;
  const showSim = isDemoMode();
  const rows = await db()`
    select a.id, a.alert_type, a.severity, a.title, a.message, a.status, a.created_at, a.acknowledged_at,
           a.is_simulated, a.snapshot_id, c.room_code, u.display_name as acknowledged_by_name,
           exists (select 1 from alert_reads r where r.alert_id = a.id and r.user_id = ${user.id}) as read
      from alerts a
      left join classrooms c on c.id = a.classroom_id
      left join users u on u.id = a.acknowledged_by
     where (${all} or a.classroom_id = any(${scope}))
       and (${status}::text is null or a.status = ${status})
       and (${showSim} or not a.is_simulated)
     order by a.created_at desc limit 200`;
  return NextResponse.json({ alerts: rows });
});

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireApiUser(["admin"]);
  const rows = await db()`
    select l.id, l.created_at, l.username, l.success, l.reason, l.ip, u.role
      from login_attempts l left join users u on u.id = l.user_id
     order by l.created_at desc limit 300`;
  return NextResponse.json({ attempts: rows });
});

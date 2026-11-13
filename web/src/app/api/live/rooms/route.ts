import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { listRooms, roomLive } from "@/lib/dashboard";
import { runSweeps } from "@/lib/sweeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireApiUser(["admin", "teacher"]);
  void runSweeps();
  const rooms = await listRooms(user);
  const live = await Promise.all(rooms.map((r) => roomLive(r.id)));
  return NextResponse.json({ rooms: live.filter(Boolean), server_time: new Date().toISOString() });
});

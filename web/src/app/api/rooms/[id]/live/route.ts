import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";
import { roomLive } from "@/lib/dashboard";
import { runSweeps } from "@/lib/sweeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  await assertRoomAccess(user, id);
  void runSweeps();
  const live = await roomLive(id);
  if (!live) throw new ApiError(404, "not_found", "Not found");
  return NextResponse.json(live);
});

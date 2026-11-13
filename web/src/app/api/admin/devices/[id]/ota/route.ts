import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { deployFirmware } from "@/lib/ota";

export const runtime = "nodejs";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  const { release_id } = z.strictObject({ release_id: z.uuid() }).parse(await readJson(req, 512));
  return NextResponse.json({ ok: true, ...(await deployFirmware(id, release_id, user.id, clientIp(req))) }, { status: 202 });
});

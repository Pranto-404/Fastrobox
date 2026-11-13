import { NextResponse } from "next/server";
import { ApiError, assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { ADMIN_RESOURCES } from "@/lib/adminDispatch";

export const runtime = "nodejs";

export const POST = route<{ params: Promise<{ resource: string }> }>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const r = ADMIN_RESOURCES[(await params).resource];
  if (!r?.create) throw new ApiError(404, "not_found", "Unknown resource");
  const out = await r.create(await readJson(req, 16 * 1024), { actor: user.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true, ...(out as object) }, { status: 201 });
});

import { NextResponse } from "next/server";
import { ApiError, assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { ADMIN_RESOURCES } from "@/lib/adminDispatch";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const { resource, id } = await params;
  const r = ADMIN_RESOURCES[resource];
  if (!r?.update) throw new ApiError(404, "not_found", "Unknown resource");
  const out = await r.update(id, await readJson(req, 16 * 1024), { actor: user.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true, ...((out as object) ?? {}) });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const { resource, id } = await params;
  const r = ADMIN_RESOURCES[resource];
  if (!r?.remove) throw new ApiError(404, "not_found", "Unknown resource");
  const out = await r.remove(id, { actor: user.id, ip: clientIp(req) });
  return NextResponse.json({ ok: true, ...((out as object) ?? {}) });
});

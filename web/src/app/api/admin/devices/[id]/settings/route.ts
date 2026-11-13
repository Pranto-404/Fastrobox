import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { currentSettings, settingsHistory, updateSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function deviceId(params: Ctx["params"]) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  return id;
}

/** Admin only (Level 5): a Teacher gets 403. */
export const GET = route<Ctx>(async (_req, { params }) => {
  await requireApiUser(["admin"]);
  const id = await deviceId(params);
  return NextResponse.json({ current: await currentSettings(id), history: await settingsHistory(id) });
});

export const PUT = route<Ctx>(async (req, { params }) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const id = await deviceId(params);
  const r = await updateSettings(id, await readJson(req, 1024), user.id, clientIp(req));
  return NextResponse.json({ ok: true, ...r, status: "pending" }, { status: 202 });
});

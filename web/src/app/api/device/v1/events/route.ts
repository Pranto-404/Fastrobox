import { NextResponse } from "next/server";
import { ApiError, route, readJson } from "@/lib/http";
import { assertBodyDevice, authenticateDevice } from "@/lib/device/auth";
import { eventSchema } from "@/lib/device/schemas";
import { ingestEvent, ReplayError } from "@/lib/device/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const dev = await authenticateDevice(req);
  const body = eventSchema.parse(await readJson(req, 4 * 1024));
  assertBodyDevice(dev, body.device_id);
  try {
    const r = await ingestEvent(dev, body);
    return NextResponse.json({ ok: true, id: r.id, seq: body.seq, server_time: Math.floor(Date.now() / 1000) }, { status: 201 });
  } catch (e) {
    if (e instanceof ReplayError) throw new ApiError(409, "replay_rejected", e.message, { seq: body.seq });
    throw e;
  }
});

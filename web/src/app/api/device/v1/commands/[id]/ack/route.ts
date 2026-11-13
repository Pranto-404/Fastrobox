import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route, readJson } from "@/lib/http";
import { authenticateDevice } from "@/lib/device/auth";
import { commandAckSchema } from "@/lib/device/schemas";
import { ackCommand } from "@/lib/device/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const dev = await authenticateDevice(req);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "command_not_found", "No such command");
  const body = commandAckSchema.parse(await readJson(req, 2048));
  const r = await ackCommand(dev, id, body);
  return NextResponse.json({ ok: true, ...r });
});

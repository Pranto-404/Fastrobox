import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/http";
import { authenticateDevice } from "@/lib/device/auth";
import { otaProgressSchema } from "@/lib/device/schemas";
import { recordOtaProgress } from "@/lib/ota";

export const runtime = "nodejs";

export const POST = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  const dev = await authenticateDevice(req);
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) throw new ApiError(404, "not_found", "Not found");
  await recordOtaProgress(dev.id, jobId, otaProgressSchema.parse(await readJson(req, 1024)));
  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { ApiError, route, readJson } from "@/lib/http";
import { assertBodyDevice, authenticateDevice } from "@/lib/device/auth";
import { checkinSchema, parseDeviceTs } from "@/lib/device/schemas";
import { checkIn } from "@/lib/attendance";
import { decodeFaceJpeg } from "@/lib/face";
import { notifyAlerts } from "@/lib/notify";
import type { CreatedAlert } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Level 7 check-in: card UID + the face crop detected on the device.
 * Response: { decision: GRANTED|DENIED, reason, text, unlock_ms? }.
 * The face image is used for this decision only and is never stored, except as the
 * single private snapshot required for a FACE MISMATCH / SPOOF alert (Level 8).
 */
export const POST = route(async (req) => {
  const dev = await authenticateDevice(req);
  const body = checkinSchema.parse(await readJson(req, 128 * 1024));
  assertBodyDevice(dev, body.device_id);
  if (body.room_id !== dev.room_id) {
    throw new ApiError(409, "room_mismatch", "room_id differs from the last telemetry; send telemetry first");
  }
  const jpeg = decodeFaceJpeg(body.face_jpeg_b64);
  if (!jpeg) throw new ApiError(422, "invalid_face_image", "face_jpeg_b64 must be a JPEG of at most 64 KB");
  const tappedAt = parseDeviceTs(body.ts).date ?? new Date();
  const alerts: CreatedAlert[] = [];
  const result = await checkIn(dev, { uid: body.uid, tappedAt, jpeg, faceW: body.face_w, faceH: body.face_h }, alerts);
  if (alerts.length) await notifyAlerts(alerts);
  return NextResponse.json({ ok: true, seq: body.seq, ...result, server_time: Math.floor(Date.now() / 1000) });
});

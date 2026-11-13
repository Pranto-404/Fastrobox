import { NextResponse } from "next/server";
import { ApiError, assertSameOrigin, clientIp, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { config } from "@/lib/env";
import { uploadFirmware } from "@/lib/ota";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin"]);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > config().OTA_MAX_BYTES + 64 * 1024) throw new ApiError(413, "payload_too_large", "Firmware file too large");
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) throw new ApiError(422, "file_required", "Choose a firmware .bin file");
  const r = await uploadFirmware(file, String(fd.get("version") ?? ""), (fd.get("notes") as string) || null, user.id, clientIp(req), config().OTA_MAX_BYTES);
  return NextResponse.json({ ok: true, ...r }, { status: 201 });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, route } from "@/lib/http";
import { authenticateDevice } from "@/lib/device/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Firmware download for the device's own OTA job only. Headers carry size and SHA-256 to verify. */
export const GET = route<{ params: Promise<{ jobId: string }> }>(async (req, { params }) => {
  const dev = await authenticateDevice(req);
  const { jobId } = await params;
  if (!z.uuid().safeParse(jobId).success) throw new ApiError(404, "not_found", "Not found");
  const [r] = await db()<{ binary_data: Buffer; sha256: string; version: string; status: string }[]>`
    select f.binary_data, f.sha256, f.version, j.status from ota_jobs j join firmware_releases f on f.id = j.release_id
     where j.id = ${jobId} and j.device_id = ${dev.id}`;
  if (!r) throw new ApiError(404, "not_found", "No such OTA job for this device");
  if (!["pending", "downloading"].includes(r.status)) throw new ApiError(409, "job_closed", `Job is ${r.status}`);
  await db()`update ota_jobs set status = 'downloading', updated_at = now() where id = ${jobId} and status = 'pending'`;
  return new Response(new Uint8Array(r.binary_data), {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(r.binary_data.length),
      "x-firmware-version": r.version,
      "x-firmware-sha256": r.sha256,
      "cache-control": "no-store",
    },
  });
});

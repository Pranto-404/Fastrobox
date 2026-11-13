/**
 * OTA (Level 5), server side. The Admin uploads a firmware .bin; the server stores
 * it with its SHA-256 and a structural check of the ESP32 app image. Deploying
 * creates an ota_jobs row and an OTA_UPDATE command; the device downloads the image
 * over HTTPS with its token, verifies size + SHA-256 (and the bootloader verifies
 * the image), installs it into the other OTA partition, reboots, and reports
 * OTA_DONE / OTA_REJECTED / OTA_ROLLBACK. Rollback (no server contact within 60 s)
 * is decided on the device.
 *
 * A file that fails the server check can still be sent on purpose, so the
 * device-side rejection (judge test "damaged firmware") can be demonstrated.
 */
import { createHash } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { ApiError } from "./http";
import { createCommand } from "./device/commands";

export type ImageCheck = { ok: true; segments: number } | { ok: false; reason: string };

/** Walks the ESP32 application image header and segment table (esp_image_format.h). */
export function checkEsp32Image(buf: Buffer): ImageCheck {
  if (buf.length < 24 + 8) return { ok: false, reason: "file too small" };
  if (buf[0] !== 0xe9) return { ok: false, reason: "not an ESP32 app image (magic byte is not 0xE9)" };
  const segments = buf[1];
  if (segments < 1 || segments > 16) return { ok: false, reason: `invalid segment count ${segments}` };
  let off = 24; // esp_image_header_t
  for (let i = 0; i < segments; i++) {
    if (off + 8 > buf.length) return { ok: false, reason: `truncated in segment header ${i}` };
    const len = buf.readUInt32LE(off + 4);
    off += 8 + len;
    if (off > buf.length) return { ok: false, reason: `truncated: segment ${i} needs ${off} bytes, file has ${buf.length}` };
  }
  // checksum byte padded to a 16-byte boundary (+ optional 32-byte SHA-256 appended)
  const withChecksum = (off + 16) & ~15;
  if (withChecksum > buf.length) return { ok: false, reason: "truncated: image checksum missing" };
  return { ok: true, segments };
}

export async function uploadFirmware(file: File, version: string, notes: string | null, actor: string, ip: string | null, maxBytes: number) {
  if (!/^[0-9A-Za-z.+_-]{1,40}$/.test(version)) throw new ApiError(422, "bad_version", "Version must be like 1.0.1");
  if (file.size <= 0 || file.size > maxBytes) throw new ApiError(413, "file_size", `Firmware must be 1 byte to ${maxBytes} bytes`);
  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const check = checkEsp32Image(buf);
  try {
    const [row] = await db()<{ id: string }[]>`
      insert into firmware_releases (version, filename, size_bytes, sha256, binary_data, notes, uploaded_by)
      values (${version}, ${file.name.slice(0, 120)}, ${buf.length}, ${sha256}, ${buf},
              ${[notes, check.ok ? null : `SERVER CHECK FAILED: ${check.reason}`].filter(Boolean).join(" | ") || null}, ${actor})
      returning id`;
    await audit(actor, "firmware.upload", { type: "firmware", id: row.id }, { version, size: buf.length, sha256, check }, ip);
    return { id: row.id, version, size: buf.length, sha256, check };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "version_exists", "This version was already uploaded");
    throw e;
  }
}

export async function deployFirmware(deviceId: string, releaseId: string, actor: string, ip: string | null) {
  return db().begin(async (tx) => {
    const [rel] = await tx<{ version: string; sha256: string; size_bytes: number }[]>`
      select version, sha256, size_bytes from firmware_releases where id = ${releaseId}`;
    if (!rel) throw new ApiError(404, "not_found", "Firmware not found");
    const [dev] = await tx<{ firmware_version: string | null }[]>`select firmware_version from devices where id = ${deviceId} for update`;
    if (!dev) throw new ApiError(404, "not_found", "Device not found");
    const busy = await tx`select 1 from ota_jobs where device_id = ${deviceId} and status in ('pending', 'downloading', 'verifying', 'installed')`;
    if (busy.length) throw new ApiError(409, "ota_in_progress", "An update is already in progress for this device");
    const [job] = await tx<{ id: string }[]>`
      insert into ota_jobs (device_id, release_id, from_version, to_version, created_by)
      values (${deviceId}, ${releaseId}, ${dev.firmware_version}, ${rel.version}, ${actor}) returning id`;
    const cmd = await createCommand(tx, deviceId, "OTA_UPDATE", {
      job_id: job.id, version: rel.version, size: rel.size_bytes, sha256: rel.sha256,
      path: `/api/device/v1/ota/${job.id}/firmware`,
    }, actor, 15);
    await tx`update ota_jobs set command_id = ${cmd} where id = ${job.id}`;
    await tx`insert into ota_job_events (job_id, status, progress, message) values (${job.id}, 'pending', 0, 'queued')`;
    await audit(actor, "firmware.deploy", { type: "ota_job", id: job.id }, { device: deviceId, version: rel.version }, ip, tx);
    return { job_id: job.id, command_id: cmd };
  }) as Promise<{ job_id: string; command_id: string }>;
}

export async function recordOtaProgress(deviceId: string, jobId: string, p: { status: string; progress?: number; message?: string; running_version?: string }) {
  return db().begin(async (tx) => {
    const [j] = await tx<{ status: string }[]>`select status from ota_jobs where id = ${jobId} and device_id = ${deviceId} for update`;
    if (!j) throw new ApiError(404, "not_found", "No such OTA job for this device");
    if (["done", "rejected", "failed", "rolled_back"].includes(j.status)) throw new ApiError(409, "job_closed", `Job already ${j.status}`);
    await tx`update ota_jobs set status = ${p.status}, progress = coalesce(${p.progress ?? null}, progress),
                    message = coalesce(${p.message ?? null}, message), updated_at = now() where id = ${jobId}`;
    await tx`insert into ota_job_events (job_id, status, progress, message) values (${jobId}, ${p.status}, ${p.progress ?? null}, ${p.message ?? null})`;
    if (p.running_version) await tx`update devices set firmware_version = ${p.running_version} where id = ${deviceId}`;
    if (["done", "rejected", "failed", "rolled_back"].includes(p.status)) {
      await tx`update device_commands set status = ${p.status === "done" ? "applied" : p.status === "rejected" ? "rejected" : "failed"},
                      completed_at = now(), result = ${tx.json({ message: p.message ?? null })}
                where id = (select command_id from ota_jobs where id = ${jobId}) and status in ('pending', 'delivered')`;
    }
  });
}

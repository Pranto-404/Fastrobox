import { db } from "../db";
import { isDemoMode } from "../env";
import { ApiError } from "../http";
import { newToken, sha256Hex } from "../crypto";

export interface DeviceContext {
  id: string;
  device_uid: string;
  name: string;
  classroom_id: string | null;
  room_id: string | null;
  is_simulated: boolean;
  online_threshold_s: number;
  credential_id: string;
}

/**
 * Authenticates a device by its bearer token. Identity comes ONLY from the token;
 * a `device_id` in the body is checked against it but never trusted on its own.
 */
export async function authenticateDevice(req: Request): Promise<DeviceContext> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(frx_dev_[A-Za-z0-9_-]{20,100})$/.exec(header.trim());
  if (!m) throw new ApiError(401, "device_unauthorized", "Missing or malformed device token");
  const hash = sha256Hex(m[1]);
  const rows = await db()<DeviceContext[]>`
    update device_credentials c set last_used_at = now()
      from devices d
     where c.token_hash = ${hash} and c.revoked_at is null and d.id = c.device_id
    returning d.id, d.device_uid, d.name, d.classroom_id, d.room_id, d.is_simulated, d.online_threshold_s, c.id as credential_id`;
  const dev = rows[0];
  if (!dev) throw new ApiError(401, "device_unauthorized", "Invalid or revoked device token");
  if (dev.is_simulated && !isDemoMode()) {
    throw new ApiError(403, "simulated_device_rejected", "Simulated devices are rejected in LIVE mode");
  }
  return dev;
}

export function assertBodyDevice(dev: DeviceContext, bodyDeviceId: string) {
  if (bodyDeviceId !== dev.device_uid) {
    throw new ApiError(403, "device_mismatch", "device_id in body does not match the authenticated device");
  }
}

/** Issues a new token for a device. The plaintext is returned once and never stored. */
export async function issueDeviceToken(deviceId: string, createdBy: string | null) {
  const token = newToken("frx_dev");
  await db()`
    insert into device_credentials (device_id, token_hash, token_prefix, created_by)
    values (${deviceId}, ${sha256Hex(token)}, ${token.slice(0, 12)}, ${createdBy})`;
  return token;
}

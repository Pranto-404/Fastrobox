import { z } from "zod";
import { db } from "./db";
import { audit } from "./audit";
import { issueDeviceToken } from "./device/auth";

export const newDeviceSchema = z.strictObject({
  device_uid: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  name: z.string().trim().min(1).max(80),
  classroom_id: z.uuid().nullable().optional(),
  is_simulated: z.boolean().default(false),
  online_threshold_s: z.number().int().min(3).max(3600).default(20),
});

/** Registers a device and returns its one-time plaintext token. */
export async function registerDevice(input: z.input<typeof newDeviceSchema>, actor: string | null, ip: string | null = null) {
  const d = newDeviceSchema.parse(input);
  const [row] = await db()<{ id: string }[]>`
    insert into devices (device_uid, name, classroom_id, is_simulated, online_threshold_s)
    values (${d.device_uid}, ${d.name}, ${d.classroom_id ?? null}, ${d.is_simulated}, ${d.online_threshold_s})
    returning id`;
  const token = await issueDeviceToken(row.id, actor);
  await audit(actor, "device.register", { type: "device", id: row.id }, { device_uid: d.device_uid, simulated: d.is_simulated }, ip);
  return { id: row.id, device_uid: d.device_uid, token };
}

/** Revokes all existing tokens and issues a new one. */
export async function rotateDeviceToken(deviceId: string, actor: string, ip: string | null) {
  await db()`update device_credentials set revoked_at = now() where device_id = ${deviceId} and revoked_at is null`;
  const token = await issueDeviceToken(deviceId, actor);
  await audit(actor, "device.token.rotate", { type: "device", id: deviceId }, {}, ip);
  return token;
}

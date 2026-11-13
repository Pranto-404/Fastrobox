/**
 * Operator actions sent to a device. The dashboard shows each one as pending until
 * the device acknowledges it; nothing is shown as done on the server's word alone.
 */
import { db } from "./db";
import { audit } from "./audit";
import { createCommand } from "./device/commands";
import { ApiError } from "./http";

/** Teacher/Admin "Reset fire" (Level 3). The device decides whether it can re-lock. */
export async function requestFireReset(deviceId: string, userId: string, ip: string | null): Promise<string> {
  return db().begin(async (tx) => {
    const [d] = await tx<{ fire_latched: boolean }[]>`select fire_latched from devices where id = ${deviceId} for update`;
    if (!d) throw new ApiError(404, "device_not_found", "Device not found");
    if (!d.fire_latched) throw new ApiError(409, "no_fire_latched", "The device has no latched fire state");
    await tx`update device_commands set status = 'expired', completed_at = now()
              where device_id = ${deviceId} and command_type = 'FIRE_RESET' and status in ('pending', 'delivered')`;
    const id = await createCommand(tx, deviceId, "FIRE_RESET", {}, userId, 5);
    await audit(userId, "device.fire_reset.request", { type: "device", id: deviceId }, {}, ip, tx);
    return id;
  }) as Promise<string>;
}

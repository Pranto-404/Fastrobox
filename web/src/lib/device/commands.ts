import { db, type Tx } from "../db";
import { ApiError } from "../http";
import { audit } from "../audit";
import type { DeviceContext } from "./auth";

export type CommandType = "APPLY_SETTINGS" | "FIRE_RESET" | "OTA_UPDATE" | "CAMERA_POSITION" | "NIGHT_MODE";

export interface DeviceCommand {
  id: string;
  command_type: CommandType;
  payload: Record<string, unknown>;
  status: string;
  created_at: Date;
  expires_at: Date;
}

export async function createCommand(
  tx: Tx,
  deviceId: string,
  type: CommandType,
  payload: Record<string, unknown>,
  userId: string | null,
  ttlMinutes = 10,
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into device_commands (device_id, command_type, payload, created_by, expires_at)
    values (${deviceId}, ${type}, ${tx.json(payload as never)}, ${userId}, now() + make_interval(mins => ${ttlMinutes}))
    returning id`;
  return row.id;
}

/** Returns commands the device should execute and marks them delivered. */
export async function pollCommands(dev: DeviceContext): Promise<DeviceCommand[]> {
  return db().begin(async (tx) => {
    await tx`update device_commands set status = 'expired', completed_at = now()
              where device_id = ${dev.id} and status in ('pending', 'delivered') and expires_at < now()`;
    await tx`update ota_jobs j set status = 'failed', message = 'command expired before completion', updated_at = now()
              from device_commands c
             where j.command_id = c.id and c.device_id = ${dev.id} and c.status = 'expired'
               and j.status in ('pending')`;
    const rows = await tx<DeviceCommand[]>`
      update device_commands set status = case when status = 'pending' then 'delivered' else status end,
             delivered_at = coalesce(delivered_at, now())
       where device_id = ${dev.id} and status in ('pending', 'delivered')
      returning id, command_type, payload, status, created_at, expires_at`;
    return rows.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  }) as Promise<DeviceCommand[]>;
}

/** Device acknowledgement. Only the device can move a command to applied/failed/rejected. */
export async function ackCommand(
  dev: DeviceContext,
  commandId: string,
  ack: { status: "applied" | "failed" | "rejected"; message?: string; applied_version?: number },
) {
  return db().begin(async (tx) => {
    const [cmd] = await tx<{ id: string; command_type: CommandType; status: string; payload: Record<string, unknown> }[]>`
      select id, command_type, status, payload from device_commands
       where id = ${commandId} and device_id = ${dev.id} for update`;
    if (!cmd) throw new ApiError(404, "command_not_found", "No such command for this device");
    if (!["pending", "delivered"].includes(cmd.status)) {
      throw new ApiError(409, "command_closed", `Command already ${cmd.status}`);
    }
    if (cmd.command_type === "APPLY_SETTINGS" && ack.status === "applied") {
      if (ack.applied_version !== cmd.payload.version) {
        throw new ApiError(422, "version_mismatch", `applied_version must equal ${String(cmd.payload.version)}`);
      }
    }
    await tx`
      update device_commands set status = ${ack.status}, completed_at = now(),
             result = ${tx.json({ message: ack.message ?? null, applied_version: ack.applied_version ?? null })}
       where id = ${cmd.id}`;
    if (cmd.command_type === "FIRE_RESET" && ack.status === "applied") {
      // The device confirmed the door is LOCKED again; only now is the latch cleared.
      await tx`update devices set fire_latched = false where id = ${dev.id}`;
      await tx`update alerts set status = 'resolved', resolved_at = now()
                where device_id = ${dev.id} and alert_type = 'FIRE' and status <> 'resolved'`;
    }
    if (cmd.command_type === "OTA_UPDATE" && (ack.status === "rejected" || ack.status === "failed")) {
      await tx`update ota_jobs set status = ${ack.status === "rejected" ? "rejected" : "failed"},
                      message = ${ack.message ?? null}, updated_at = now()
                where command_id = ${cmd.id}`;
    }
    await audit(null, `device.command.${ack.status}`, { type: "device_command", id: cmd.id },
      { device: dev.device_uid, command_type: cmd.command_type, message: ack.message ?? null }, null, tx);
    return { id: cmd.id, status: ack.status };
  });
}

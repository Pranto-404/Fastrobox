import { db } from "./db";
import { audit } from "./audit";
import { createCommand } from "./device/commands";
import { DEFAULT_DEVICE_SETTINGS, deviceSettingsSchema, type DeviceSettings } from "./safety";

export interface SettingsVersion {
  version: number;
  settings: DeviceSettings;
  created_at: Date | null;
  created_by_name: string | null;
}

/** Latest requested settings version (version 0 = factory defaults, never sent). */
export async function currentSettings(deviceId: string): Promise<SettingsVersion> {
  const [row] = await db()<SettingsVersion[]>`
    select s.version, s.settings, s.created_at, u.display_name as created_by_name
      from device_settings s left join users u on u.id = s.created_by
     where s.device_id = ${deviceId} order by s.version desc limit 1`;
  return row ?? { version: 0, settings: DEFAULT_DEVICE_SETTINGS, created_at: null, created_by_name: null };
}

/** Latest version the device has confirmed it applied. */
export async function appliedSettingsVersion(deviceId: string): Promise<number | null> {
  const [row] = await db()<{ v: number | null }[]>`
    select max((payload->>'version')::int) as v from device_commands
     where device_id = ${deviceId} and command_type = 'APPLY_SETTINGS' and status = 'applied'`;
  return row?.v ?? null;
}

export async function settingsHistory(deviceId: string) {
  return db()`
    select s.version, s.settings, s.created_at, u.display_name as created_by_name,
           c.id as command_id, c.status as command_status, c.completed_at, c.result
      from device_settings s
      left join users u on u.id = s.created_by
      left join device_commands c on c.device_id = s.device_id and c.command_type = 'APPLY_SETTINGS'
                                 and (c.payload->>'version')::int = s.version
     where s.device_id = ${deviceId}
     order by s.version desc limit 50`;
}

/**
 * Validates and stores a new settings version, then queues an APPLY_SETTINGS command.
 * The new values are "pending" until the device acknowledges them.
 */
export async function updateSettings(deviceId: string, input: unknown, userId: string, ip: string | null) {
  const settings = deviceSettingsSchema.parse(input);
  return db().begin(async (tx) => {
    await tx`select id from devices where id = ${deviceId} for update`;
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0) + 1 as next from device_settings where device_id = ${deviceId}`;
    await tx`insert into device_settings (device_id, version, settings, created_by)
             values (${deviceId}, ${next}, ${tx.json(settings)}, ${userId})`;
    // Supersede older settings commands that the device has not applied yet.
    await tx`update device_commands set status = 'expired', completed_at = now(),
                    result = ${tx.json({ message: "superseded by version " + next })}
              where device_id = ${deviceId} and command_type = 'APPLY_SETTINGS' and status in ('pending', 'delivered')`;
    const commandId = await createCommand(tx, deviceId, "APPLY_SETTINGS", { version: next, settings }, userId, 30);
    await audit(userId, "device.settings.update", { type: "device", id: deviceId }, { version: next, settings }, ip, tx);
    return { version: next, settings, command_id: commandId };
  });
}

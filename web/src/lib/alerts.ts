import { db, type Tx } from "./db";

export type AlertType =
  | "FIRE" | "PANIC" | "HEAT_DANGER" | "HEAT_WARNING" | "SENSOR_ERROR" | "DEVICE_OFFLINE"
  | "FACE_MISMATCH" | "SPOOF" | "CARD_BLOCKED" | "INTRUDER" | "OVER_CAPACITY"
  | "CAMERA_FAULT" | "WEATHER" | "HAND_RAISED";

/** Alert types that also go to the Teacher's phone (Level 4: FIRE, PANIC, Heat Danger; L8/L9 security). */
export const PHONE_ALERT_TYPES: AlertType[] = ["FIRE", "PANIC", "HEAT_DANGER", "FACE_MISMATCH", "SPOOF", "INTRUDER", "CAMERA_FAULT"];

export interface NewAlert {
  classroomId: string | null;
  deviceId: string | null;
  type: AlertType;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  sourceEventId?: number | null;
  isSimulated: boolean;
  /** Security alerts (one per attempt) skip the "already open" de-duplication. */
  allowDuplicate?: boolean;
}

export interface CreatedAlert extends NewAlert {
  id: number;
}

/**
 * Creates an alert unless an unresolved alert of the same type is already open for
 * the same device/classroom (prevents duplicate alerts from telemetry + events).
 * Returns the new alert, or null if de-duplicated.
 */
export async function raiseAlert(tx: Tx, a: NewAlert): Promise<CreatedAlert | null> {
  const existing = a.allowDuplicate ? [] : await tx`
    select id from alerts
     where alert_type = ${a.type} and status <> 'resolved'
       and device_id is not distinct from ${a.deviceId}
       and classroom_id is not distinct from ${a.classroomId}
     limit 1`;
  if (existing.length) return null;
  const [row] = await tx<{ id: number }[]>`
    insert into alerts (classroom_id, device_id, alert_type, severity, title, message, source_event_id, is_simulated)
    values (${a.classroomId}, ${a.deviceId}, ${a.type}, ${a.severity}, ${a.title}, ${a.message},
            ${a.sourceEventId ?? null}, ${a.isSimulated})
    returning id`;
  return { ...a, id: row.id };
}

/** Auto-resolve open alerts of the given types (used when a condition clears). */
export async function resolveAlerts(tx: Tx, deviceId: string, types: AlertType[]) {
  if (!types.length) return;
  await tx`
    update alerts set status = 'resolved', resolved_at = now()
     where device_id = ${deviceId} and alert_type = any(${types}) and status <> 'resolved'`;
}

/**
 * Single-winner acknowledgement: only the first caller transitions open → acknowledged.
 * Returns the acknowledging user id (possibly someone else's) and whether we won.
 */
export async function acknowledgeAlert(alertId: number, userId: string) {
  const won = await db()<{ id: number }[]>`
    update alerts set status = 'acknowledged', acknowledged_by = ${userId}, acknowledged_at = now()
     where id = ${alertId} and status = 'open'
    returning id`;
  const [row] = await db()<{ status: string; acknowledged_by: string | null; acknowledged_at: Date | null; name: string | null }[]>`
    select a.status, a.acknowledged_by, a.acknowledged_at, u.display_name as name
      from alerts a left join users u on u.id = a.acknowledged_by where a.id = ${alertId}`;
  return { won: won.length === 1, ...row };
}

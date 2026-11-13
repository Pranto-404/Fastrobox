import type { Tx } from "./db";
import type { ServerEventType } from "./device/schemas";

/** Records a server event (question paper section 6: server id in place of seq). */
export async function serverEvent(
  tx: Tx,
  e: {
    deviceId: string | null;
    classroomId: string | null;
    roomId: string | null;
    type: ServerEventType;
    detail?: string;
    severity?: "info" | "warning" | "critical";
    at?: Date;
    isSimulated?: boolean;
  },
): Promise<number> {
  const [row] = await tx<{ id: number }[]>`
    insert into device_events (device_id, classroom_id, room_id, event_type, detail, severity, origin, recorded_at,
                               clock_valid, is_simulated)
    values (${e.deviceId}, ${e.classroomId}, ${e.roomId}, ${e.type}, ${e.detail ?? ""}, ${e.severity ?? "info"},
            'server', ${e.at ?? new Date()}, true, ${e.isSimulated ?? false})
    returning id`;
  return row.id;
}

/** Ensures a classroom exists for a Room ID typed on the device setup page. */
export async function resolveRoom(tx: Tx, roomId: string): Promise<string> {
  const [found] = await tx<{ id: string }[]>`select id from classrooms where lower(room_code) = lower(${roomId})`;
  if (found) return found.id;
  const [created] = await tx<{ id: string }[]>`
    insert into classrooms (room_code, name) values (${roomId}, ${"Room " + roomId})
    on conflict (room_code) do update set room_code = excluded.room_code
    returning id`;
  return created.id;
}

/**
 * Device message ingestion: telemetry, events, offline sync.
 *
 * Guarantees
 *  - Exactly once: (device_id, seq) is UNIQUE. A message with a seq that is already
 *    stored (a replay) is rejected with HTTP 409 and stores nothing.
 *  - Original device time (ts, Unix seconds) is preserved as recorded_at when the
 *    clock is valid; otherwise the receive time is used and clock_valid = false.
 *  - Offline/online transitions are recorded as server events and alerts.
 *  - Status is tracked by recorded time, so replayed (older) records never
 *    overwrite the current status.
 *  - The Room ID comes from the device (typed on its setup page by the judge); the
 *    device is linked to the classroom with that Room ID, created if needed.
 */
import { db, type Tx } from "../db";
import { raiseAlert, resolveAlerts, type AlertType, type CreatedAlert } from "../alerts";
import { notifyAlerts } from "../notify";
import { resolveRoom, serverEvent } from "../events";
import { recordOfflineEntry } from "../attendance";
import type { DeviceContext } from "./auth";
import { parseDeviceTs, type EventPayload, type TelemetryPayload } from "./schemas";

export class ReplayError extends Error {
  constructor(public seq: number) {
    super(`seq ${seq} already stored`);
  }
}

interface Stamp {
  clockValid: boolean;
  recordedAt: Date;
}

function stamp(ts: number, now: Date): Stamp {
  const { date, valid } = parseDeviceTs(ts, now.getTime());
  return { clockValid: valid, recordedAt: date ?? now };
}

export interface IngestOpts {
  replay?: boolean;
  tx?: Tx;
  alerts?: CreatedAlert[];
}

/** Locks the device row, records offline→online transitions, links the room, updates last_seen. */
async function touchDevice(tx: Tx, dev: DeviceContext, seq: number, roomId: string, fw?: string) {
  const [d] = await tx<{ connection_state: string; last_seen_at: Date | null; offline_since: Date | null; room_id: string | null; stale: boolean }[]>`
    select connection_state, last_seen_at, offline_since, room_id,
           coalesce(last_seen_at < now() - make_interval(secs => online_threshold_s), false) as stale
      from devices where id = ${dev.id} for update`;

  if (d.room_id !== roomId || !dev.classroom_id) {
    dev.classroom_id = await resolveRoom(tx, roomId);
    await tx`update devices set room_id = ${roomId}, classroom_id = ${dev.classroom_id} where id = ${dev.id}`;
  }
  dev.room_id = roomId;

  if (d.connection_state === "online" && d.stale && d.last_seen_at) {
    // Went silent but no sweep ran yet: record the missed offline period.
    await serverEvent(tx, {
      deviceId: dev.id, classroomId: dev.classroom_id, roomId, type: "DEVICE_OFFLINE", severity: "warning",
      detail: `last seen ${d.last_seen_at.toISOString()}`,
      at: new Date(d.last_seen_at.getTime() + dev.online_threshold_s * 1000), isSimulated: dev.is_simulated,
    });
  }
  if (d.connection_state !== "online" || d.stale) {
    await serverEvent(tx, {
      deviceId: dev.id, classroomId: dev.classroom_id, roomId, type: "DEVICE_ONLINE",
      detail: `previous=${d.connection_state}`, isSimulated: dev.is_simulated,
    });
    await resolveAlerts(tx, dev.id, ["DEVICE_OFFLINE"]);
  }
  await tx`
    update devices set last_seen_at = now(), connection_state = 'online', offline_since = null,
           last_seq = greatest(coalesce(last_seq, -1), ${seq}),
           firmware_version = coalesce(${fw ?? null}, firmware_version)
     where id = ${dev.id}`;
}

async function alert(
  tx: Tx, dev: DeviceContext, out: CreatedAlert[], type: AlertType, severity: "info" | "warning" | "critical",
  title: string, message: string, sourceEventId?: number,
) {
  const created = await raiseAlert(tx, {
    classroomId: dev.classroom_id, deviceId: dev.id, type, severity, title,
    message: `${dev.room_id ?? "?"} · ${dev.device_uid}: ${message}`,
    sourceEventId: sourceEventId ?? null, isSimulated: dev.is_simulated,
  });
  if (created) out.push(created);
}

/** Applies a device-reported status if it is the newest one; raises/clears alerts on change. */
async function applyStatus(tx: Tx, dev: DeviceContext, p: TelemetryPayload, recordedAt: Date, out: CreatedAlert[]) {
  const [row] = await tx<{ prev: string | null }[]>`
    with old as (select last_status as prev from devices where id = ${dev.id})
    update devices set last_status = ${p.status}, last_status_at = ${recordedAt},
           fire_latched = fire_latched or ${p.status === "FIRE"}
     where id = ${dev.id} and (last_status_at is null or last_status_at <= ${recordedAt})
    returning (select prev from old) as prev`;
  if (!row) return; // older than the current status (offline replay): history only

  // Data quality: bad readings raise a sensor alert that clears when quality is good again.
  if (p.quality === "bad") {
    await alert(tx, dev, out, "SENSOR_ERROR", "warning", "Sensor error", "quality=bad (reading not trustworthy)");
  } else {
    await resolveAlerts(tx, dev.id, ["SENSOR_ERROR"]);
  }

  if (row.prev === p.status) return;
  const reading = `T=${p.temp_c ?? "-"}°C RH=${p.rh ?? "-"}% HI=${p.heat_index_c ?? "-"}°C`;
  if (p.status === "SAFE") await resolveAlerts(tx, dev.id, ["HEAT_WARNING", "HEAT_DANGER"]);
  if (p.status === "WARNING") {
    await resolveAlerts(tx, dev.id, ["HEAT_DANGER"]);
    await alert(tx, dev, out, "HEAT_WARNING", "warning", "Heat warning", reading);
  }
  if (p.status === "DANGER") {
    await resolveAlerts(tx, dev.id, ["HEAT_WARNING"]);
    await alert(tx, dev, out, "HEAT_DANGER", "critical", "Heat danger", reading);
  }
  if (p.status === "FIRE") await alert(tx, dev, out, "FIRE", "critical", "FIRE – EVACUATE", `flame detected, door ${p.door}`);
}

export async function ingestTelemetry(dev: DeviceContext, p: TelemetryPayload, opts: IngestOpts = {}): Promise<{ id: number }> {
  return withTx(opts, async (tx, alerts) => {
    const st = stamp(p.ts, new Date());
    await touchDevice(tx, dev, p.seq, p.room_id, p.fw);
    const rows = await tx<{ id: number }[]>`
      insert into telemetry (device_id, room_id, seq, ts, clock_valid, recorded_at, uptime_s, temp_c, rh, heat_index_c,
                             flame, door, status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality,
                             is_offline_replay, is_simulated, raw)
      values (${dev.id}, ${p.room_id}, ${p.seq}, ${p.ts}, ${st.clockValid}, ${st.recordedAt}, ${p.uptime_s}, ${p.temp_c},
              ${p.rh}, ${p.heat_index_c}, ${p.flame}, ${p.door}, ${p.status}, ${p.heat_trend}, ${p.rssi}, ${p.heap_kb},
              ${p.chip_temp_c}, ${p.fw}, ${p.quality}, ${Boolean(opts.replay)}, ${dev.is_simulated}, ${tx.json(p as never)})
      on conflict on constraint telemetry_device_seq_unique do nothing
      returning id`;
    if (!rows.length) throw new ReplayError(p.seq);
    await applyStatus(tx, dev, p, st.recordedAt, alerts);
    return { id: rows[0].id };
  });
}

const EVENT_SEVERITY: Partial<Record<EventPayload["type"], "info" | "warning" | "critical">> = {
  FIRE: "critical",
  PANIC: "critical",
  SENSOR_ERROR: "warning",
  ENTRY_DENIED: "warning",
  NO_FACE: "warning",
  OTA_REJECTED: "warning",
  OTA_ROLLBACK: "warning",
};

/** Extracts a hex card UID from an event detail such as "uid=04A1B2C3" or "04:A1:B2:C3". */
export function uidFromDetail(detail: string): string | null {
  const m = /(?:uid=)?([0-9A-Fa-f]{2}(?:[:\s-]?[0-9A-Fa-f]{2}){3,9})/.exec(detail);
  return m ? m[1].replace(/[:\s-]/g, "").toUpperCase() : null;
}

export async function ingestEvent(dev: DeviceContext, p: EventPayload, opts: IngestOpts = {}): Promise<{ id: number }> {
  return withTx(opts, async (tx, alerts) => {
    const st = stamp(p.ts, new Date());
    await touchDevice(tx, dev, p.seq, p.room_id);
    const rows = await tx<{ id: number }[]>`
      insert into device_events (device_id, classroom_id, room_id, seq, event_type, detail, severity, origin, ts,
                                 clock_valid, recorded_at, is_offline_replay, is_simulated)
      values (${dev.id}, ${dev.classroom_id}, ${p.room_id}, ${p.seq}, ${p.type}, ${p.detail},
              ${EVENT_SEVERITY[p.type] ?? "info"}, 'device', ${p.ts}, ${st.clockValid}, ${st.recordedAt},
              ${Boolean(opts.replay)}, ${dev.is_simulated})
      on conflict on constraint device_events_device_seq_unique do nothing
      returning id`;
    if (!rows.length) throw new ReplayError(p.seq);
    const eventId = rows[0].id;

    switch (p.type) {
      case "BOOT": {
        const reason = /reason=([A-Z_]+)/.exec(p.detail)?.[1] ?? (p.detail.trim() || null);
        await tx`update devices set last_reset_reason = ${reason} where id = ${dev.id}`;
        break;
      }
      case "CARD_TAP": {
        const uid = uidFromDetail(p.detail);
        if (uid) {
          await tx`update devices set last_card_uid = ${uid}, last_card_at = ${st.recordedAt}
                    where id = ${dev.id} and (last_card_at is null or last_card_at <= ${st.recordedAt})`;
        }
        break;
      }
      case "FIRE":
        await tx`update devices set fire_latched = true where id = ${dev.id}`;
        await alert(tx, dev, alerts, "FIRE", "critical", "FIRE – EVACUATE", p.detail || "flame detected", eventId);
        break;
      case "PANIC":
        await tx`update devices set panic_at = greatest(panic_at, ${st.recordedAt}) where id = ${dev.id}`;
        await alert(tx, dev, alerts, "PANIC", "critical", "PANIC", p.detail || "panic pad touched", eventId);
        break;
      case "SENSOR_ERROR":
        await alert(tx, dev, alerts, "SENSOR_ERROR", "warning", "Sensor error", p.detail || "sensor error", eventId);
        break;
      case "OTA_DONE":
      case "OTA_REJECTED":
      case "OTA_ROLLBACK": {
        const status = p.type === "OTA_DONE" ? "done" : p.type === "OTA_REJECTED" ? "rejected" : "rolled_back";
        await tx`
          update ota_jobs set status = ${status}, message = ${p.detail || null}, updated_at = now(),
                 progress = case when ${status} = 'done' then 100 else progress end
           where id = (select id from ota_jobs where device_id = ${dev.id}
                        and status not in ('done', 'rejected', 'failed', 'rolled_back')
                        order by created_at desc limit 1)`;
        break;
      }
      case "OFFLINE_ENTRY": {
        const uid = uidFromDetail(p.detail);
        if (uid) await recordOfflineEntry(tx, dev, uid, st.recordedAt, Boolean(opts.replay));
        break;
      }
      default:
        break;
    }
    return { id: eventId };
  });
}

/** Runs fn in the caller's transaction or a new one; sends notifications after commit. */
async function withTx<T>(opts: IngestOpts, fn: (tx: Tx, alerts: CreatedAlert[]) => Promise<T>): Promise<T> {
  if (opts.tx) return fn(opts.tx, opts.alerts ?? []);
  const alerts: CreatedAlert[] = [];
  const result = (await db().begin((tx) => fn(tx, alerts))) as T;
  if (alerts.length) await notifyAlerts(alerts);
  return result;
}

/**
 * Marks devices silent for longer than their threshold (default 15 s, i.e. three
 * missed 5-second reports) as offline, with a server event and an alert.
 */
export async function sweepDeviceHealth(): Promise<number> {
  const alerts: CreatedAlert[] = [];
  const count = await db().begin(async (tx) => {
    const gone = await tx<{ id: string; classroom_id: string | null; room_id: string | null; device_uid: string; is_simulated: boolean; offline_since: Date }[]>`
      update devices set connection_state = 'offline',
             offline_since = last_seen_at + make_interval(secs => online_threshold_s)
       where connection_state = 'online'
         and last_seen_at < now() - make_interval(secs => online_threshold_s)
      returning id, classroom_id, room_id, device_uid, is_simulated, offline_since`;
    for (const d of gone) {
      await serverEvent(tx, {
        deviceId: d.id, classroomId: d.classroom_id, roomId: d.room_id, type: "DEVICE_OFFLINE", severity: "warning",
        detail: "no data", at: d.offline_since, isSimulated: d.is_simulated,
      });
      const created = await raiseAlert(tx, {
        classroomId: d.classroom_id, deviceId: d.id, type: "DEVICE_OFFLINE", severity: "warning", title: "Device offline",
        message: `${d.room_id ?? "?"} · ${d.device_uid}: no data since ${d.offline_since.toISOString()}`,
        isSimulated: d.is_simulated,
      });
      if (created) alerts.push(created);
    }
    return gone.length;
  });
  if (alerts.length) await notifyAlerts(alerts);
  return count as number;
}

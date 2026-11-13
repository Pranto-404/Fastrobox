/**
 * Read models for the live dashboards. Every function takes the session user and
 * returns only data inside that user's scope.
 */
import { db, num } from "./db";
import { isDemoMode } from "./env";
import { roomIdsFor } from "./access";
import { currentSettings } from "./settings";
import type { SessionUser } from "./auth/session";

export interface RoomLive {
  classroom: { id: string; room_code: string; name: string; capacity: number };
  device: null | {
    id: string;
    device_uid: string;
    is_simulated: boolean;
    connection: "online" | "offline" | "never_seen";
    net: "LIVE" | "OFFLINE" | "SYNCING";
    sync_pending: number;
    last_seen_at: string | null;
    fire_latched: boolean;
    panic_active: boolean;
    last_card_uid: string | null;
    last_card_at: string | null;
    last_reset_reason: string | null;
    firmware_version: string | null;
    camera_position: string;
    camera_state: string;
    night_mode: boolean;
  };
  reading: null | {
    recorded_at: string;
    temp_c: number | null;
    rh: number | null;
    heat_index_c: number | null;
    heat_trend: string | null;
    flame: boolean;
    door: "LOCKED" | "UNLOCKED";
    status: "SAFE" | "WARNING" | "DANGER" | "FIRE";
    quality: "good" | "bad";
    uptime_s: number | null;
    rssi: number | null;
    heap_kb: number | null;
    chip_temp_c: number | null;
    fw: string | null;
    is_simulated: boolean;
  };
  limits: { version: number; temp_warning_c: number; temp_danger_c: number; applied_version: number | null };
  fire_reset: null | { id: string; status: string; created_at: string; completed_at: string | null; message: string | null };
  recent_taps: { at: string; uid: string; name: string | null; decision: string | null; reason: string | null; offline: boolean }[];
  open_alerts: number;
}

const PANIC_ACTIVE_S = 60;

export async function listRooms(user: SessionUser) {
  const ids = await roomIdsFor(user);
  const sql = db();
  if (ids === "all") return sql<{ id: string; room_code: string; name: string }[]>`select id, room_code, name from classrooms order by room_code`;
  if (!ids.length) return [];
  return sql<{ id: string; room_code: string; name: string }[]>`select id, room_code, name from classrooms where id = any(${ids}) order by room_code`;
}

export async function roomLive(classroomId: string): Promise<RoomLive | null> {
  const sql = db();
  const showSim = isDemoMode();
  const [c] = await sql<RoomLive["classroom"][]>`select id, room_code, name, capacity from classrooms where id = ${classroomId}`;
  if (!c) return null;
  const [d] = await sql`
    select id, device_uid, is_simulated, last_seen_at, fire_latched, last_card_uid, last_card_at, last_reset_reason,
           firmware_version, camera_position, camera_state, night_mode, sync_pending, last_sync_at,
           case when last_seen_at is null then 'never_seen'
                when last_seen_at < now() - make_interval(secs => online_threshold_s) then 'offline'
                else 'online' end as connection,
           coalesce(panic_at > now() - make_interval(secs => ${PANIC_ACTIVE_S}), false) as panic_active
      from devices
     where classroom_id = ${classroomId} and (${showSim} or not is_simulated)
     order by last_seen_at desc nulls last limit 1`;
  const base: RoomLive = {
    classroom: c,
    device: null,
    reading: null,
    limits: { version: 0, temp_warning_c: 32, temp_danger_c: 40, applied_version: null },
    fire_reset: null,
    recent_taps: [],
    open_alerts: 0,
  };
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from alerts where classroom_id = ${classroomId} and status = 'open' and (${showSim} or not is_simulated)`;
  base.open_alerts = n;
  if (!d) return base;

  const connection = d.connection as "online" | "offline" | "never_seen";
  const syncing = connection === "online" && d.sync_pending > 0 && d.last_sync_at && Date.now() - new Date(d.last_sync_at).getTime() < 30_000;
  base.device = {
    id: d.id, device_uid: d.device_uid, is_simulated: d.is_simulated, connection,
    net: connection !== "online" ? "OFFLINE" : syncing ? "SYNCING" : "LIVE",
    sync_pending: d.sync_pending, last_seen_at: d.last_seen_at?.toISOString() ?? null, fire_latched: d.fire_latched,
    panic_active: d.panic_active, last_card_uid: d.last_card_uid, last_card_at: d.last_card_at?.toISOString() ?? null,
    last_reset_reason: d.last_reset_reason, firmware_version: d.firmware_version, camera_position: d.camera_position,
    camera_state: d.camera_state, night_mode: d.night_mode,
  };

  const [t] = await sql`
    select recorded_at, temp_c, rh, heat_index_c, heat_trend, flame, door, status, quality, uptime_s, rssi, heap_kb,
           chip_temp_c, fw, is_simulated
      from telemetry where device_id = ${d.id} order by recorded_at desc, id desc limit 1`;
  if (t) {
    base.reading = {
      recorded_at: t.recorded_at.toISOString(), temp_c: num(t.temp_c), rh: num(t.rh), heat_index_c: num(t.heat_index_c),
      heat_trend: t.heat_trend, flame: t.flame, door: t.door, status: t.status, quality: t.quality, uptime_s: num(t.uptime_s),
      rssi: t.rssi, heap_kb: t.heap_kb, chip_temp_c: num(t.chip_temp_c), fw: t.fw, is_simulated: t.is_simulated,
    };
  }

  const s = await currentSettings(d.id);
  const [applied] = await sql<{ v: number | null }[]>`
    select max((payload->>'version')::int) as v from device_commands
     where device_id = ${d.id} and command_type = 'APPLY_SETTINGS' and status = 'applied'`;
  base.limits = { version: s.version, ...s.settings, applied_version: applied?.v ?? null };

  const [fr] = await sql`
    select id, status, created_at, completed_at, result->>'message' as message from device_commands
     where device_id = ${d.id} and command_type = 'FIRE_RESET' order by created_at desc limit 1`;
  if (fr) base.fire_reset = { id: fr.id, status: fr.status, created_at: fr.created_at.toISOString(), completed_at: fr.completed_at?.toISOString() ?? null, message: fr.message };

  const taps = await sql`
    select e.recorded_at, e.detail, e.is_offline_replay,
           (select a.decision from access_events a where a.device_id = e.device_id and a.tapped_at between e.recorded_at - interval '10 seconds' and e.recorded_at + interval '10 seconds' order by a.id desc limit 1) as decision,
           (select a.reason from access_events a where a.device_id = e.device_id and a.tapped_at between e.recorded_at - interval '10 seconds' and e.recorded_at + interval '10 seconds' order by a.id desc limit 1) as reason
      from device_events e
     where e.device_id = ${d.id} and e.event_type in ('CARD_TAP', 'OFFLINE_ENTRY')
     order by e.recorded_at desc limit 6`;
  const uids = taps.map((x) => (/([0-9A-Fa-f]{8,20})/.exec(x.detail as string)?.[1] ?? "").toUpperCase());
  const names = uids.length
    ? await sql<{ uid: string; full_name: string }[]>`select c.uid, s.full_name from rfid_cards c join students s on s.id = c.student_id where c.uid = any(${uids})`
    : [];
  base.recent_taps = taps.map((x, i) => ({
    at: x.recorded_at.toISOString(), uid: uids[i], name: names.find((nm) => nm.uid === uids[i])?.full_name ?? null,
    decision: x.decision, reason: x.reason, offline: x.is_offline_replay,
  }));
  return base;
}

/** Red banners shown on every logged-in dashboard (Level 3/4/6). Room codes only — no private data. */
export async function activeBanners() {
  const sql = db();
  const showSim = isDemoMode();
  const alerts = await sql<{ id: number; alert_type: "FIRE" | "PANIC"; room_code: string | null; created_at: Date; is_simulated: boolean }[]>`
    select a.id, a.alert_type, c.room_code, a.created_at, a.is_simulated
      from alerts a left join classrooms c on c.id = a.classroom_id
     where a.alert_type in ('FIRE', 'PANIC') and a.status = 'open' and (${showSim} or not a.is_simulated)
     order by a.created_at desc limit 5`;
  const weather = await sql<{ id: number; message: string; origin: string }[]>`
    select id, message, origin from weather_alerts
     where removed_at is null and level = 'DANGER' and valid_from <= now() and (valid_to is null or valid_to > now())
     order by created_at desc limit 3`;
  return {
    alerts: alerts.map((a) => ({ id: a.id, type: a.alert_type, room: a.room_code ?? "?", at: a.created_at.toISOString(), simulated: a.is_simulated })),
    weather: weather.map((w) => ({ id: w.id, text: w.message, origin: w.origin })),
  };
}

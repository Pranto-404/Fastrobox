/**
 * History, daily report and CSV (Level 6). All numbers come from stored records.
 * The AI assistant answers through these same functions, so its answers always
 * match the report.
 */
import { db, num } from "./db";
import { isDemoMode } from "./env";

export const TZ = "Asia/Dhaka";

export interface DailyReport {
  room_code: string;
  date: string;
  readings: number;
  temp: { min: number | null; max: number | null; avg: number | null; max_at: string | null };
  rh: { min: number | null; max: number | null; avg: number | null };
  alarms: Record<string, number>;
  attendance: { PRESENT: number; LATE: number; ABSENT: number };
  simulated: boolean;
}

export async function dailyReport(classroomId: string, date: string): Promise<DailyReport | null> {
  const sql = db();
  const sim = isDemoMode();
  const [room] = await sql<{ room_code: string }[]>`select room_code from classrooms where id = ${classroomId}`;
  if (!room) return null;
  const [t] = await sql`
    select count(*)::int as n, min(temp_c) as tmin, max(temp_c) as tmax, round(avg(temp_c), 1) as tavg,
           min(rh) as hmin, max(rh) as hmax, round(avg(rh), 1) as havg, bool_or(t.is_simulated) as sim,
           (select recorded_at from telemetry t2 join devices d2 on d2.id = t2.device_id
             where d2.classroom_id = ${classroomId} and (t2.recorded_at at time zone ${TZ})::date = ${date}::date
               and t2.quality = 'good' and t2.temp_c is not null and (${sim} or not t2.is_simulated)
             order by t2.temp_c desc, t2.recorded_at limit 1) as max_at
      from telemetry t join devices d on d.id = t.device_id
     where d.classroom_id = ${classroomId} and (t.recorded_at at time zone ${TZ})::date = ${date}::date
       and t.quality = 'good' and t.temp_c is not null and (${sim} or not t.is_simulated)`;
  const alarms = await sql<{ alert_type: string; n: number }[]>`
    select alert_type, count(*)::int as n from alerts
     where classroom_id = ${classroomId} and (created_at at time zone ${TZ})::date = ${date}::date and (${sim} or not is_simulated)
       and alert_type in ('FIRE', 'PANIC', 'HEAT_DANGER', 'HEAT_WARNING', 'SENSOR_ERROR', 'FACE_MISMATCH', 'SPOOF', 'CARD_BLOCKED', 'INTRUDER', 'OVER_CAPACITY', 'CAMERA_FAULT', 'DEVICE_OFFLINE')
     group by alert_type`;
  const att = await sql<{ status: "PRESENT" | "LATE" | "ABSENT"; n: number }[]>`
    select a.status, count(*)::int as n from attendance a join class_schedules s on s.id = a.schedule_id
     where s.classroom_id = ${classroomId} and a.class_date = ${date}::date and (${sim} or not a.is_simulated)
     group by a.status`;
  const alarmMap: Record<string, number> = { FIRE: 0, PANIC: 0, HEAT_DANGER: 0, HEAT_WARNING: 0, SENSOR_ERROR: 0 };
  for (const a of alarms) alarmMap[a.alert_type] = a.n;
  const attendance = { PRESENT: 0, LATE: 0, ABSENT: 0 };
  for (const a of att) attendance[a.status] = a.n;
  return {
    room_code: room.room_code,
    date,
    readings: t.n,
    temp: { min: num(t.tmin), max: num(t.tmax), avg: num(t.tavg), max_at: t.max_at ? new Date(t.max_at).toISOString() : null },
    rh: { min: num(t.hmin), max: num(t.hmax), avg: num(t.havg) },
    alarms: alarmMap,
    attendance,
    simulated: Boolean(t.sim),
  };
}

export async function readings(classroomId: string, from: Date, to: Date) {
  return db()<{ recorded_at: Date; temp_c: number | null; rh: number | null; heat_index_c: number | null; status: string; quality: string; is_simulated: boolean; device_uid: string; seq: number }[]>`
    select t.recorded_at, t.temp_c::float8 as temp_c, t.rh::float8 as rh, t.heat_index_c::float8 as heat_index_c, t.status, t.quality,
           t.is_simulated, d.device_uid, t.seq
      from telemetry t join devices d on d.id = t.device_id
     where d.classroom_id = ${classroomId} and t.recorded_at between ${from} and ${to} and (${isDemoMode()} or not t.is_simulated)
     order by t.recorded_at limit 20000`;
}

export async function events(classroomId: string, from: Date, to: Date, types: string[]) {
  return db()<{ id: number; recorded_at: Date; event_type: string; detail: string; origin: string; seq: number | null; device_uid: string | null; is_offline_replay: boolean; is_simulated: boolean }[]>`
    select e.id, e.recorded_at, e.event_type, e.detail, e.origin, e.seq, d.device_uid, e.is_offline_replay, e.is_simulated
      from device_events e left join devices d on d.id = e.device_id
     where coalesce(e.classroom_id, d.classroom_id) = ${classroomId}
       and e.recorded_at between ${from} and ${to}
       and (${types.length === 0} or e.event_type = any(${types}))
       and (${isDemoMode()} or not e.is_simulated)
     order by e.recorded_at desc limit 5000`;
}

/** RFC 4180 CSV with formula-injection protection for spreadsheet apps. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

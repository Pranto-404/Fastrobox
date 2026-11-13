/**
 * Card + face check-in and attendance (question paper Levels 7, 8, 9, 12).
 *
 * Decision order for an online check-in (the device has already found a face —
 * otherwise it denies NO FACE by itself without asking the server):
 *   1. CAMERA_NOT_AT_DOOR / CAMERA_FAULT          (Level 9)
 *   2. UNKNOWN_CARD   — no such card, or not linked to a student
 *   3. CARD_BLOCKED   — blocked after 3 mismatches in 2 minutes (5 min)  (Level 8)
 *   4. NO_CLASS_NOW   — no class running now in this room
 *   5. NOT_IN_THIS_CLASS — the card's student is not enrolled in that class
 *   6. FACE_MISMATCH / SPOOF — the face is not the card owner's, or not live
 *   7. GRANTED — attendance recorded once per student per class
 *
 * Attendance windows (per schedule, defaults from the paper): Present within the
 * first 10 minutes, Late after that, Absent for anyone not checked in after 30.
 */
import type { Tx } from "./db";
import { db } from "./db";
import type { DeviceContext } from "./device/auth";
import { raiseAlert, type CreatedAlert } from "./alerts";
import { serverEvent } from "./events";
import { verifyFace } from "./face";

export type DenyReason =
  | "UNKNOWN_CARD"
  | "CARD_BLOCKED"
  | "NO_CLASS_NOW"
  | "NOT_IN_THIS_CLASS"
  | "FACE_MISMATCH"
  | "SPOOF"
  | "CAMERA_NOT_AT_DOOR"
  | "CAMERA_FAULT"
  | "NOT_ENROLLED"
  | "FACE_SERVICE_UNAVAILABLE";

export const MISMATCH_LIMIT = 3;
export const MISMATCH_WINDOW_MIN = 2;
export const CARD_BLOCK_MIN = 5;

export interface CheckinResult {
  decision: "GRANTED" | "DENIED";
  reason: DenyReason | "PRESENT" | "LATE" | "ABSENT" | "ALREADY_CHECKED_IN";
  /** Human text for the device (Serial Monitor / local page). */
  text: string;
  student?: { code: string; name: string };
  attendance?: { status: "PRESENT" | "LATE" | "ABSENT"; class_date: string; subject: string; new_record: boolean };
  unlock_ms?: number;
}

export function windowStatus(minutesFromStart: number, s: { present_until_min: number; absent_after_min: number }) {
  if (minutesFromStart <= s.present_until_min) return "PRESENT" as const;
  if (minutesFromStart <= s.absent_after_min) return "LATE" as const;
  return "ABSENT" as const;
}

interface RunningClass {
  id: string;
  subject: string;
  present_until_min: number;
  absent_after_min: number;
  local_date: string;
  minutes_from_start: number;
}

/** The class running at time `at` in a classroom (start ≤ local time ≤ end). */
export async function runningClass(tx: Tx, classroomId: string, at: Date): Promise<RunningClass | null> {
  const [s] = await tx<RunningClass[]>`
    select s.id, s.subject, s.present_until_min, s.absent_after_min,
           to_char((${at}::timestamptz at time zone s.timezone)::date, 'YYYY-MM-DD') as local_date,
           extract(epoch from ((${at}::timestamptz at time zone s.timezone)::time - s.start_time)) / 60.0 as minutes_from_start
      from class_schedules s
     where s.classroom_id = ${classroomId} and s.is_active
       and extract(dow from (${at}::timestamptz at time zone s.timezone)) = s.day_of_week
       and (${at}::timestamptz at time zone s.timezone)::time between s.start_time and s.end_time
     order by s.start_time desc
     limit 1`;
  return s ? { ...s, minutes_from_start: Number(s.minutes_from_start) } : null;
}

const TEXT: Record<string, string> = {
  UNKNOWN_CARD: "UNKNOWN CARD",
  CARD_BLOCKED: "CARD BLOCKED",
  NO_CLASS_NOW: "NO CLASS NOW",
  NOT_IN_THIS_CLASS: "NOT IN THIS CLASS",
  FACE_MISMATCH: "FACE MISMATCH",
  SPOOF: "FACE MISMATCH (SPOOF)",
  CAMERA_NOT_AT_DOOR: "CAMERA NOT AT DOOR",
  CAMERA_FAULT: "CAMERA FAULT",
  NOT_ENROLLED: "FACE NOT ENROLLED",
  FACE_SERVICE_UNAVAILABLE: "FACE CHECK UNAVAILABLE",
};

export interface CheckinInput {
  uid: string;
  tappedAt: Date;
  jpeg: Buffer;
  faceW: number;
  faceH: number;
}

/**
 * Online check-in decision. Runs the face check outside the DB transaction, then
 * records the decision atomically.
 */
export async function checkIn(dev: DeviceContext, input: CheckinInput, alerts: CreatedAlert[]): Promise<CheckinResult> {
  const deny = (reason: DenyReason, student?: CheckinResult["student"]): CheckinResult => ({
    decision: "DENIED",
    reason,
    text: TEXT[reason] ?? reason,
    ...(student ? { student } : {}),
  });
  const sql = db();
  const log = async (tx: Tx, r: CheckinResult, ids: { cardId?: string | null; studentId?: string | null; attendanceId?: string | null }, extra: { distance?: number; liveness?: number } = {}) => {
    await tx`
      insert into access_events (device_id, classroom_id, card_uid, card_id, student_id, decision, reason, attendance_id,
                                 face_w, face_h, face_bytes, face_distance, liveness_score, tapped_at, is_simulated)
      values (${dev.id}, ${dev.classroom_id}, ${input.uid}, ${ids.cardId ?? null}, ${ids.studentId ?? null}, ${r.decision},
              ${r.reason}, ${ids.attendanceId ?? null}, ${input.faceW}, ${input.faceH}, ${input.jpeg.length},
              ${extra.distance ?? null}, ${extra.liveness ?? null}, ${input.tappedAt}, ${dev.is_simulated})`;
  };

  // 1. Camera position and health (Level 9).
  const [cam] = await sql<{ camera_position: string; camera_state: string }[]>`
    select camera_position, camera_state from devices where id = ${dev.id}`;
  if (cam.camera_position !== "DOOR") {
    const r = deny("CAMERA_NOT_AT_DOOR");
    await log(sql, r, {});
    return r;
  }
  if (cam.camera_state === "COVERED" || cam.camera_state === "MOVED") {
    const r = deny("CAMERA_FAULT");
    await log(sql, r, {});
    return r;
  }

  // 2-5. Card, block, class, enrolment.
  const [card] = await sql<{ id: string; kind: string; status: string; student_id: string | null; blocked: boolean }[]>`
    select id, kind, status, student_id, coalesce(blocked_until > now(), false) as blocked
      from rfid_cards where uid = ${input.uid}`;
  if (!card || card.kind !== "student" || card.status !== "active" || !card.student_id) {
    const r = deny("UNKNOWN_CARD");
    await sql.begin(async (tx) => {
      await log(tx, r, { cardId: card?.id });
      await serverEvent(tx, { deviceId: dev.id, classroomId: dev.classroom_id, roomId: dev.room_id, type: "UNKNOWN_CARD", detail: `uid=${input.uid}`, isSimulated: dev.is_simulated });
    });
    return r;
  }
  const [stu] = await sql<{ id: string; student_code: string; full_name: string; classroom_id: string | null }[]>`
    select id, student_code, full_name, classroom_id from students where id = ${card.student_id}`;
  const student = { code: stu.student_code, name: stu.full_name };
  const ids = { cardId: card.id, studentId: stu.id };
  if (card.blocked) {
    const r = deny("CARD_BLOCKED", student);
    await log(sql, r, ids);
    return r;
  }
  const cls = dev.classroom_id ? await runningClass(sql, dev.classroom_id, input.tappedAt) : null;
  if (!cls) {
    const r = deny("NO_CLASS_NOW", student);
    await log(sql, r, ids);
    return r;
  }
  if (stu.classroom_id !== dev.classroom_id) {
    const r = deny("NOT_IN_THIS_CLASS", student);
    await log(sql, r, ids);
    return r;
  }

  // 6. Face must match the card's owner and be live. Never fall back to the card alone.
  const face = await verifyFace(stu.id, input.jpeg);
  if (!face.ok) {
    const r = deny(face.error === "NOT_ENROLLED" ? "NOT_ENROLLED" : "FACE_SERVICE_UNAVAILABLE", student);
    await log(sql, r, ids);
    return r;
  }
  if (!face.live || !face.match) {
    const reason: DenyReason = face.live ? "FACE_MISMATCH" : "SPOOF";
    const r = deny(reason, student);
    await sql.begin(async (tx) => {
      await log(tx, r, ids, { distance: face.distance, liveness: face.liveness_score });
      const [snap] = await tx<{ id: string }[]>`
        insert into private_snapshots (kind, device_id, classroom_id, student_id, mime, width, height, image)
        values (${reason}, ${dev.id}, ${dev.classroom_id}, ${stu.id}, 'image/jpeg', ${input.faceW}, ${input.faceH}, ${input.jpeg})
        returning id`;
      await serverEvent(tx, { deviceId: dev.id, classroomId: dev.classroom_id, roomId: dev.room_id, type: reason, severity: "critical", detail: `uid=${input.uid} card_owner=${stu.student_code}`, isSimulated: dev.is_simulated });
      const created = await raiseAlert(tx, {
        classroomId: dev.classroom_id, deviceId: dev.id, type: reason, severity: "critical",
        title: reason === "SPOOF" ? "Photo spoofing attempt" : "Face does not match card owner",
        message: `${dev.room_id} · card of ${stu.full_name} (${stu.student_code}) used by someone else`,
        isSimulated: dev.is_simulated, allowDuplicate: true,
      });
      if (created) {
        await tx`update alerts set snapshot_id = ${snap.id} where id = ${created.id}`;
        alerts.push(created);
      }
      // Lockout: 3 mismatches for the same card within 2 minutes block it for 5 minutes.
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from access_events
         where card_id = ${card.id} and reason in ('FACE_MISMATCH', 'SPOOF')
           and tapped_at > ${input.tappedAt}::timestamptz - make_interval(mins => ${MISMATCH_WINDOW_MIN})`;
      if (n >= MISMATCH_LIMIT) {
        await tx`update rfid_cards set blocked_until = now() + make_interval(mins => ${CARD_BLOCK_MIN}),
                        blocked_reason = ${`${n} face mismatches within ${MISMATCH_WINDOW_MIN} minutes`}
                  where id = ${card.id}`;
        await serverEvent(tx, { deviceId: dev.id, classroomId: dev.classroom_id, roomId: dev.room_id, type: "CARD_BLOCKED", severity: "critical", detail: `uid=${input.uid} for ${CARD_BLOCK_MIN} min`, isSimulated: dev.is_simulated });
        const blocked = await raiseAlert(tx, {
          classroomId: dev.classroom_id, deviceId: dev.id, type: "CARD_BLOCKED", severity: "warning", title: "Card blocked",
          message: `${dev.room_id} · card ${input.uid} (${stu.student_code}) blocked for ${CARD_BLOCK_MIN} minutes`,
          isSimulated: dev.is_simulated, allowDuplicate: true,
        });
        if (blocked) alerts.push(blocked);
      }
    });
    return r;
  }

  // 7. Granted: one attendance record per student per class.
  return sql.begin(async (tx) => {
    const att = await markAttendance(tx, dev, stu.id, card.id, cls, input.tappedAt, { method: "CARD_FACE", faceVerified: true, offline: false });
    const r: CheckinResult = {
      decision: "GRANTED",
      reason: att.newRecord ? att.status : "ALREADY_CHECKED_IN",
      text: att.newRecord ? `${stu.full_name} ${att.status}` : `${stu.full_name} already checked in`,
      student,
      attendance: { status: att.status, class_date: cls.local_date, subject: cls.subject, new_record: att.newRecord },
      unlock_ms: 5000,
    };
    await log(tx, r, { ...ids, attendanceId: att.id }, { distance: face.distance, liveness: face.liveness_score });
    return r;
  }) as Promise<CheckinResult>;
}

async function markAttendance(
  tx: Tx,
  dev: DeviceContext,
  studentId: string,
  cardId: string,
  cls: RunningClass,
  at: Date,
  o: { method: "CARD_FACE" | "OFFLINE_CARD"; faceVerified: boolean; offline: boolean },
) {
  const status = windowStatus(cls.minutes_from_start, cls);
  const inserted = await tx<{ id: string; status: "PRESENT" | "LATE" | "ABSENT" }[]>`
    insert into attendance (student_id, schedule_id, class_date, status, first_seen_at, method, face_verified, card_id,
                            device_id, is_offline_replay, is_simulated)
    values (${studentId}, ${cls.id}, ${cls.local_date}, ${status}, ${at}, ${o.method}, ${o.faceVerified}, ${cardId},
            ${dev.id}, ${o.offline}, ${dev.is_simulated})
    on conflict on constraint attendance_unique do nothing
    returning id, status`;
  if (inserted.length) {
    if (status !== "PRESENT") await notifyGuardians(tx, inserted[0].id);
    return { id: inserted[0].id, status: inserted[0].status, newRecord: true };
  }
  const [existing] = await tx<{ id: string; status: "PRESENT" | "LATE" | "ABSENT" }[]>`
    select id, status from attendance where student_id = ${studentId} and schedule_id = ${cls.id} and class_date = ${cls.local_date}`;
  return { id: existing.id, status: existing.status, newRecord: false };
}

/**
 * Offline entry (Level 12): the device admitted a cached card of the running class
 * without a face check. Attendance uses the time of the tap and is flagged
 * face-not-verified.
 */
export async function recordOfflineEntry(tx: Tx, dev: DeviceContext, uid: string, tappedAt: Date, replay: boolean) {
  const [card] = await tx<{ id: string; student_id: string | null }[]>`
    select id, student_id from rfid_cards where uid = ${uid} and kind = 'student'`;
  let attendanceId: string | null = null;
  let reason = "OFFLINE_ENTRY";
  if (card?.student_id && dev.classroom_id) {
    const cls = await runningClass(tx, dev.classroom_id, tappedAt);
    if (cls) {
      const att = await markAttendance(tx, dev, card.student_id, card.id, cls, tappedAt, { method: "OFFLINE_CARD", faceVerified: false, offline: replay });
      attendanceId = att.id;
      if (!att.newRecord) reason = "OFFLINE_ENTRY_ALREADY_CHECKED_IN";
    } else reason = "OFFLINE_ENTRY_NO_CLASS";
  } else reason = "OFFLINE_ENTRY_UNKNOWN_CARD";
  await tx`
    insert into access_events (device_id, classroom_id, card_uid, card_id, student_id, decision, reason, attendance_id,
                               tapped_at, is_offline_replay, is_simulated)
    values (${dev.id}, ${dev.classroom_id}, ${uid}, ${card?.id ?? null}, ${card?.student_id ?? null}, 'GRANTED', ${reason},
            ${attendanceId}, ${tappedAt}, ${replay}, ${dev.is_simulated})`;
}

async function notifyGuardians(tx: Tx, attendanceId: string) {
  await tx`
    insert into guardian_notifications (guardian_id, student_id, attendance_id, kind, message)
    select g.guardian_id, a.student_id, a.id, a.status,
           st.full_name || ' was marked ' || a.status || ' for ' || cs.subject || ' on ' || to_char(a.class_date, 'YYYY-MM-DD')
             || coalesce(' (entry ' || to_char(a.first_seen_at at time zone cs.timezone, 'HH24:MI') || ')', '')
      from attendance a
      join students st on st.id = a.student_id
      join class_schedules cs on cs.id = a.schedule_id
      join guardian_student_links g on g.student_id = a.student_id
     where a.id = ${attendanceId} and a.status in ('LATE', 'ABSENT')
    on conflict on constraint guardian_notifications_unique do nothing`;
}

/**
 * Marks ABSENT every enrolled student without a record once today's class has
 * passed its absent cut-off, and notifies guardians. Idempotent; run by the sweeps.
 */
export async function finalizeAbsences(): Promise<number> {
  return db().begin(async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into attendance (student_id, schedule_id, class_date, status, method)
      select st.id, s.id, (now() at time zone s.timezone)::date, 'ABSENT', 'AUTO_ABSENT'
        from class_schedules s
        join students st on st.classroom_id = s.classroom_id
       where s.is_active
         and extract(dow from (now() at time zone s.timezone)) = s.day_of_week
         and (now() at time zone s.timezone)::time >= s.start_time + make_interval(mins => s.absent_after_min)
      on conflict on constraint attendance_unique do nothing
      returning id`;
    for (const r of rows) await notifyGuardians(tx, r.id);
    return rows.length;
  }) as Promise<number>;
}

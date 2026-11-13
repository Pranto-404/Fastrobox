/**
 * Admin services (Level 4/5/7/8): users, classrooms, devices, students, cards and
 * Teacher tags, schedules. Every mutation is validated with zod and audited.
 */
import { z } from "zod";
import { db } from "./db";
import { audit } from "./audit";
import { ApiError } from "./http";
import { hashPassword, PASSWORD_RULES } from "./auth/password";
import { serverEvent } from "./events";
import { cardUid } from "./device/schemas";

const uuid = z.uuid();
const optUuid = z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional());

export const createUserSchema = z.strictObject({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "3-40 characters: a-z 0-9 . _ -"),
  display_name: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "teacher", "student", "guardian"]),
  password: z.string().min(PASSWORD_RULES.min, `at least ${PASSWORD_RULES.min} characters`).max(PASSWORD_RULES.max),
  telegram_chat_id: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^-?\d{4,20}$/).nullable().optional()),
});

export async function createUser(input: unknown, actor: string, ip: string | null) {
  const u = createUserSchema.parse(input);
  const hash = await hashPassword(u.password);
  try {
    const [row] = await db()<{ id: string }[]>`
      insert into users (username, display_name, role, password_hash, telegram_chat_id)
      values (${u.username}, ${u.display_name}, ${u.role}, ${hash}, ${u.telegram_chat_id ?? null}) returning id`;
    await audit(actor, "user.create", { type: "user", id: row.id }, { username: u.username, role: u.role }, ip);
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "username_taken", "Username already exists");
    throw e;
  }
}

export const updateUserSchema = z.strictObject({
  is_active: z.boolean().optional(),
  password: z.string().min(PASSWORD_RULES.min).max(PASSWORD_RULES.max).optional(),
  telegram_chat_id: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^-?\d{4,20}$/).nullable().optional()),
  unlock: z.literal(true).optional(),
});

export async function updateUser(id: string, input: unknown, actor: string, ip: string | null) {
  uuid.parse(id);
  const u = updateUserSchema.parse(input);
  if (u.is_active === false && id === actor) throw new ApiError(422, "cannot_disable_self", "You cannot disable your own account");
  const hash = u.password ? await hashPassword(u.password) : null;
  const rows = await db()`
    update users set
      is_active = coalesce(${u.is_active ?? null}, is_active),
      password_hash = coalesce(${hash}, password_hash),
      telegram_chat_id = case when ${u.telegram_chat_id !== undefined} then ${u.telegram_chat_id ?? null} else telegram_chat_id end,
      failed_attempts = case when ${Boolean(u.unlock)} then 0 else failed_attempts end,
      locked_until = case when ${Boolean(u.unlock)} then null else locked_until end,
      updated_at = now()
    where id = ${id} returning id`;
  if (!rows.length) throw new ApiError(404, "not_found", "User not found");
  if (hash || u.is_active === false) await db()`update sessions set revoked_at = now() where user_id = ${id} and revoked_at is null`;
  await audit(actor, "user.update", { type: "user", id }, { ...u, password: u.password ? "(changed)" : undefined }, ip);
}

export const classroomSchema = z.strictObject({
  room_code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/),
  name: z.string().trim().min(1).max(80),
  capacity: z.coerce.number().int().min(1).max(1000).default(40),
});

export async function createClassroom(input: unknown, actor: string, ip: string | null) {
  const c = classroomSchema.parse(input);
  try {
    const [row] = await db()<{ id: string }[]>`
      insert into classrooms (room_code, name, capacity) values (${c.room_code}, ${c.name}, ${c.capacity}) returning id`;
    await audit(actor, "classroom.create", { type: "classroom", id: row.id }, c, ip);
    return row;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "room_exists", "Room ID already exists");
    throw e;
  }
}

export const updateClassroomSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  capacity: z.coerce.number().int().min(1).max(1000).optional(),
  teacher_ids: z.array(uuid).max(50).optional(),
});

export async function updateClassroom(id: string, input: unknown, actor: string, ip: string | null) {
  uuid.parse(id);
  const c = updateClassroomSchema.parse(input);
  await db().begin(async (tx) => {
    const rows = await tx`update classrooms set name = coalesce(${c.name ?? null}, name), capacity = coalesce(${c.capacity ?? null}, capacity)
                          where id = ${id} returning id`;
    if (!rows.length) throw new ApiError(404, "not_found", "Classroom not found");
    if (c.teacher_ids) {
      const ok = await tx<{ id: string }[]>`select id from users where id = any(${c.teacher_ids}) and role = 'teacher'`;
      if (ok.length !== c.teacher_ids.length) throw new ApiError(422, "not_teachers", "Every assigned user must be a teacher");
      await tx`delete from teacher_classrooms where classroom_id = ${id}`;
      for (const t of c.teacher_ids) await tx`insert into teacher_classrooms (teacher_id, classroom_id) values (${t}, ${id})`;
    }
    await audit(actor, "classroom.update", { type: "classroom", id }, c, ip, tx);
  });
}

export const studentSchema = z.strictObject({
  student_code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/),
  full_name: z.string().trim().min(1).max(120),
  full_name_bn: z.preprocess((v) => (v === "" ? null : v), z.string().max(120).nullable().optional()),
  classroom_id: optUuid,
  user_id: optUuid,
  guardian_id: optUuid,
});

export async function createStudent(input: unknown, actor: string, ip: string | null) {
  const s = studentSchema.parse(input);
  return db().begin(async (tx) => {
    if (s.user_id) {
      const [u] = await tx`select role from users where id = ${s.user_id}`;
      if (u?.role !== "student") throw new ApiError(422, "not_student_user", "Linked account must have the Student role");
    }
    const [row] = await tx<{ id: string }[]>`
      insert into students (student_code, full_name, full_name_bn, classroom_id, user_id)
      values (${s.student_code}, ${s.full_name}, ${s.full_name_bn ?? null}, ${s.classroom_id ?? null}, ${s.user_id ?? null})
      returning id`;
    if (s.guardian_id) {
      const [g] = await tx`select role from users where id = ${s.guardian_id}`;
      if (g?.role !== "guardian") throw new ApiError(422, "not_guardian", "Linked guardian must have the Guardian role");
      await tx`insert into guardian_student_links (guardian_id, student_id) values (${s.guardian_id}, ${row.id})`;
    }
    await audit(actor, "student.create", { type: "student", id: row.id }, { code: s.student_code }, ip, tx);
    return row;
  }).catch((e) => {
    if ((e as { code?: string }).code === "23505") throw new ApiError(409, "student_exists", "Student code or account already used");
    throw e;
  });
}

export const updateStudentSchema = z.strictObject({
  classroom_id: optUuid,
  add_guardian_id: optUuid,
  remove_guardian_id: optUuid,
  face_consent: z.literal(true).optional(),
});

export async function updateStudent(id: string, input: unknown, actor: string, ip: string | null) {
  uuid.parse(id);
  const s = updateStudentSchema.parse(input);
  await db().begin(async (tx) => {
    const [st] = await tx`select id from students where id = ${id} for update`;
    if (!st) throw new ApiError(404, "not_found", "Student not found");
    if (s.classroom_id !== undefined) await tx`update students set classroom_id = ${s.classroom_id ?? null} where id = ${id}`;
    if (s.face_consent) await tx`update students set face_consent_at = now(), face_consent_by = ${actor} where id = ${id}`;
    if (s.add_guardian_id) {
      const [g] = await tx`select role from users where id = ${s.add_guardian_id}`;
      if (g?.role !== "guardian") throw new ApiError(422, "not_guardian", "Linked guardian must have the Guardian role");
      await tx`insert into guardian_student_links (guardian_id, student_id) values (${s.add_guardian_id}, ${id}) on conflict do nothing`;
    }
    if (s.remove_guardian_id) await tx`delete from guardian_student_links where guardian_id = ${s.remove_guardian_id} and student_id = ${id}`;
    await audit(actor, "student.update", { type: "student", id }, s, ip, tx);
  });
}

/**
 * Level 8: deleting a student removes at once their face embeddings, card links,
 * private snapshots, attendance and guardian links (FK cascades / explicit deletes),
 * and records STUDENT_DELETED (who deleted whom and when) in the audit log.
 */
export async function deleteStudent(id: string, actor: string, ip: string | null) {
  uuid.parse(id);
  return db().begin(async (tx) => {
    const [s] = await tx<{ student_code: string; full_name: string; classroom_id: string | null }[]>`
      select student_code, full_name, classroom_id from students where id = ${id} for update`;
    if (!s) throw new ApiError(404, "not_found", "Student not found");
    const counts = {
      face_embeddings: (await tx`delete from face_embeddings where student_id = ${id} returning id`).length,
      cards_unlinked: (await tx`delete from rfid_cards where student_id = ${id} returning id`).length,
      snapshots: (await tx`delete from private_snapshots where student_id = ${id} returning id`).length,
    };
    await tx`delete from students where id = ${id}`;
    const [actorRow] = await tx<{ username: string }[]>`select username from users where id = ${actor}`;
    await serverEvent(tx, { deviceId: null, classroomId: s.classroom_id, roomId: null, type: "STUDENT_DELETED", detail: `${s.student_code} by ${actorRow?.username ?? actor}` });
    await audit(actor, "STUDENT_DELETED", { type: "student", id }, { student_code: s.student_code, full_name: s.full_name, ...counts }, ip, tx);
    return counts;
  }) as Promise<Record<string, number>>;
}

export const cardSchema = z.strictObject({
  uid: cardUid,
  kind: z.enum(["student", "teacher_tag"]).default("student"),
  student_id: optUuid,
  user_id: optUuid,
  label: z.preprocess((v) => (v === "" ? null : v), z.string().max(60).nullable().optional()),
});

export async function registerCard(input: unknown, actor: string, ip: string | null) {
  const c = cardSchema.parse(input);
  if (c.kind === "teacher_tag" && c.student_id) throw new ApiError(422, "tag_not_student", "A Teacher tag cannot be linked to a student");
  return db().begin(async (tx) => {
    // Re-registering a UID moves it (the Admin "changes the link").
    const [row] = await tx<{ id: string }[]>`
      insert into rfid_cards (uid, kind, student_id, user_id, label, registered_by)
      values (${c.uid}, ${c.kind}, ${c.student_id ?? null}, ${c.user_id ?? null}, ${c.label ?? null}, ${actor})
      on conflict (uid) do update set kind = excluded.kind, student_id = excluded.student_id, user_id = excluded.user_id,
             label = excluded.label, status = 'active', blocked_until = null, blocked_reason = null, registered_by = excluded.registered_by
      returning id`;
    await audit(actor, "card.register", { type: "card", id: row.id }, { uid: c.uid, kind: c.kind, student_id: c.student_id ?? null }, ip, tx);
    return row;
  }) as Promise<{ id: string }>;
}

export const updateCardSchema = z.strictObject({
  student_id: optUuid,
  status: z.enum(["active", "lost", "revoked"]).optional(),
  unblock: z.literal(true).optional(),
});

export async function updateCard(id: string, input: unknown, actor: string, ip: string | null) {
  uuid.parse(id);
  const c = updateCardSchema.parse(input);
  const rows = await db()`
    update rfid_cards set
      student_id = case when ${c.student_id !== undefined} then ${c.student_id ?? null} else student_id end,
      status = coalesce(${c.status ?? null}, status),
      blocked_until = case when ${Boolean(c.unblock)} then null else blocked_until end,
      blocked_reason = case when ${Boolean(c.unblock)} then null else blocked_reason end
    where id = ${id} returning uid`;
  if (!rows.length) throw new ApiError(404, "not_found", "Card not found");
  await audit(actor, c.unblock ? "card.unblock" : "card.update", { type: "card", id }, { uid: rows[0].uid, ...c }, ip);
}

export async function deleteCard(id: string, actor: string, ip: string | null) {
  uuid.parse(id);
  const rows = await db()`delete from rfid_cards where id = ${id} returning uid`;
  if (!rows.length) throw new ApiError(404, "not_found", "Card not found");
  await audit(actor, "card.delete", { type: "card", id }, { uid: rows[0].uid }, ip);
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "HH:MM");
export const scheduleSchema = z.strictObject({
  classroom_id: uuid,
  teacher_id: optUuid,
  subject: z.string().trim().min(1).max(80),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: time,
  end_time: time,
  present_until_min: z.coerce.number().int().min(0).max(240).default(10),
  absent_after_min: z.coerce.number().int().min(1).max(480).default(30),
}).refine((s) => s.end_time > s.start_time, { message: "End time must be after start time", path: ["end_time"] })
  .refine((s) => s.absent_after_min > s.present_until_min, { message: "Absent cut-off must be after the Present window", path: ["absent_after_min"] });

export async function createSchedule(input: unknown, actor: string, ip: string | null) {
  const s = scheduleSchema.parse(input);
  const [row] = await db()<{ id: string }[]>`
    insert into class_schedules (classroom_id, teacher_id, subject, day_of_week, start_time, end_time, present_until_min, absent_after_min)
    values (${s.classroom_id}, ${s.teacher_id ?? null}, ${s.subject}, ${s.day_of_week}, ${s.start_time}, ${s.end_time},
            ${s.present_until_min}, ${s.absent_after_min}) returning id`;
  await audit(actor, "schedule.create", { type: "schedule", id: row.id }, s, ip);
  return row;
}

export const updateScheduleSchema = z.strictObject({
  start_time: time.optional(),
  end_time: time.optional(),
  day_of_week: z.coerce.number().int().min(0).max(6).optional(),
  is_active: z.boolean().optional(),
  /** Convenience for the judges' script: "set the class start to N minutes ago" (today, school time). */
  start_minutes_ago: z.coerce.number().int().min(0).max(600).optional(),
});

export async function updateSchedule(id: string, input: unknown, actor: string, ip: string | null) {
  uuid.parse(id);
  const s = updateScheduleSchema.parse(input);
  const m = s.start_minutes_ago ?? null;
  const rows = await db()<{ start_time: string; end_time: string }[]>`
    with n as (
      select id,
             case when ${m}::int is not null
                  then date_trunc('minute', (now() at time zone timezone) - make_interval(mins => coalesce(${m}::int, 0)))::time
                  else coalesce(${s.start_time ?? null}::time, start_time) end as ns,
             case when ${m}::int is not null
                  then extract(dow from (now() at time zone timezone) - make_interval(mins => coalesce(${m}::int, 0)))::int
                  else coalesce(${s.day_of_week ?? null}::int, day_of_week) end as nd,
             coalesce(${s.end_time ?? null}::time, end_time) as ne
        from class_schedules where id = ${id})
    update class_schedules c set
      start_time = n.ns,
      day_of_week = n.nd,
      -- keep the class running: if the new start is not before the end, extend the end
      end_time = case when n.ne > n.ns then n.ne when n.ns >= '21:59'::time then '23:59:59'::time else n.ns + interval '2 hours' end,
      is_active = coalesce(${s.is_active ?? null}, c.is_active)
    from n where c.id = n.id
    returning c.start_time::text, c.end_time::text`;
  if (!rows.length) throw new ApiError(404, "not_found", "Schedule not found");
  await audit(actor, "schedule.update", { type: "schedule", id }, s, ip);
}

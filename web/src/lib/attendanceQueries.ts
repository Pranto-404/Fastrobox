import { db } from "./db";

export interface AttendanceRow {
  id: string;
  class_date: string;
  subject: string;
  room_code: string;
  status: "PRESENT" | "LATE" | "ABSENT";
  first_seen_at: Date | null;
  method: string;
  face_verified: boolean;
}

export async function studentAttendance(studentId: string, limit = 120): Promise<AttendanceRow[]> {
  return db()<AttendanceRow[]>`
    select a.id, to_char(a.class_date, 'YYYY-MM-DD') as class_date, cs.subject, c.room_code, a.status,
           a.first_seen_at, a.method, a.face_verified
      from attendance a
      join class_schedules cs on cs.id = a.schedule_id
      join classrooms c on c.id = cs.classroom_id
     where a.student_id = ${studentId}
     order by a.class_date desc, cs.start_time desc limit ${limit}`;
}

export async function studentBasic(studentId: string) {
  const [s] = await db()<{ id: string; student_code: string; full_name: string; room_code: string | null }[]>`
    select s.id, s.student_code, s.full_name, c.room_code from students s left join classrooms c on c.id = s.classroom_id where s.id = ${studentId}`;
  return s ?? null;
}

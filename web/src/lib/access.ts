/**
 * Data-scope rules (Level 4), enforced on the server for every request:
 *  - admin:    everything
 *  - teacher:  classrooms assigned in teacher_classrooms (and their devices/alerts)
 *  - student:  own attendance only
 *  - guardian: linked children only
 */
import { db } from "./db";
import { ApiError } from "./http";
import type { SessionUser } from "./auth/session";

export async function roomIdsFor(user: SessionUser): Promise<string[] | "all"> {
  if (user.role === "admin") return "all";
  if (user.role === "teacher") {
    const rows = await db()<{ classroom_id: string }[]>`select classroom_id from teacher_classrooms where teacher_id = ${user.id}`;
    return rows.map((r) => r.classroom_id);
  }
  return [];
}

export async function assertRoomAccess(user: SessionUser, classroomId: string) {
  const ids = await roomIdsFor(user);
  if (ids !== "all" && !ids.includes(classroomId)) throw new ApiError(403, "forbidden", "Not allowed");
}

export async function assertDeviceAccess(user: SessionUser, deviceId: string) {
  const [d] = await db()<{ classroom_id: string | null }[]>`select classroom_id from devices where id = ${deviceId}`;
  if (!d) throw new ApiError(404, "not_found", "Not found");
  if (user.role === "admin") return;
  if (!d.classroom_id) throw new ApiError(403, "forbidden", "Not allowed");
  await assertRoomAccess(user, d.classroom_id);
}

export async function assertStudentAccess(user: SessionUser, studentId: string) {
  if (user.role === "admin") return;
  if (user.role === "student") {
    const [s] = await db()`select 1 from students where id = ${studentId} and user_id = ${user.id}`;
    if (s) return;
  } else if (user.role === "guardian") {
    const [s] = await db()`select 1 from guardian_student_links where guardian_id = ${user.id} and student_id = ${studentId}`;
    if (s) return;
  } else if (user.role === "teacher") {
    const [s] = await db()`select 1 from students st join teacher_classrooms tc on tc.classroom_id = st.classroom_id
                            where st.id = ${studentId} and tc.teacher_id = ${user.id}`;
    if (s) return;
  }
  throw new ApiError(403, "forbidden", "Not allowed");
}

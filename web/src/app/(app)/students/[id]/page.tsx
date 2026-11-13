import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/guard";
import { assertStudentAccess } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { studentAttendance, studentBasic } from "@/lib/attendanceQueries";
import { AttendanceTable } from "@/components/AttendanceTable";
import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "Attendance" };

/**
 * One student's attendance. Allowed: Admin, the student's teachers, the student,
 * linked guardians. Anyone else gets HTTP 403 with no data (checked before any query).
 */
export default async function StudentAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    await assertStudentAccess(user, id);
  } catch {
    forbidden();
  }
  const s = await studentBasic(id);
  if (!s) notFound();
  const { t } = await getT(user.preferred_locale);
  return (
    <>
      <PageTitle sub={`${s.student_code} · ${s.room_code ?? ""}`}>{s.full_name}</PageTitle>
      <Card title={t("attendance.history")}>
        <AttendanceTable rows={await studentAttendance(id)} t={t} />
      </Card>
    </>
  );
}

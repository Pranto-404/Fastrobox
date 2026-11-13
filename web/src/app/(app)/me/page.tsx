import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { studentAttendance } from "@/lib/attendanceQueries";
import { AttendanceTable } from "@/components/AttendanceTable";
import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "My attendance" };

/** Student: own attendance only. */
export default async function MePage() {
  const user = await requirePageUser(["student"]);
  const { t } = await getT(user.preferred_locale);
  const [s] = await db()<{ id: string; full_name: string; student_code: string }[]>`
    select id, full_name, student_code from students where user_id = ${user.id}`;
  return (
    <>
      <PageTitle sub={s ? <Link className="hover:underline" href={`/students/${s.id}`}>{s.full_name} · {s.student_code}</Link> : undefined}>{t("nav.myAttendance")}</PageTitle>
      <Card>{s ? <AttendanceTable rows={await studentAttendance(s.id)} t={t} /> : <p className="text-ink-300">{t("common.noData")}</p>}</Card>
    </>
  );
}

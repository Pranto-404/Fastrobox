import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { AdminForm, RowAction } from "@/components/AdminForm";
import { Card, PageTitle, Table } from "@/components/ui";

export const metadata = { title: "Class schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const sql = db();
  const rows = await sql<{ id: string; room_code: string; subject: string; day_of_week: number; start_time: string; end_time: string; present_until_min: number; absent_after_min: number; teacher: string | null; is_active: boolean }[]>`
    select s.id, c.room_code, s.subject, s.day_of_week, to_char(s.start_time, 'HH24:MI') as start_time, to_char(s.end_time, 'HH24:MI') as end_time,
           s.present_until_min, s.absent_after_min, u.display_name as teacher, s.is_active
      from class_schedules s join classrooms c on c.id = s.classroom_id left join users u on u.id = s.teacher_id
     order by c.room_code, s.day_of_week, s.start_time`;
  const rooms = await sql<{ id: string; room_code: string }[]>`select id, room_code from classrooms order by room_code`;
  const teachers = await sql<{ id: string; display_name: string }[]>`select id, display_name from users where role = 'teacher' order by display_name`;
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: t(`day.${d}` as "day.0") }));
  const todayDow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" })).getDay();
  return (
    <>
      <PageTitle>{t("nav.schedules")}</PageTitle>
      <Card title={t("common.add")}>
        <AdminForm
          endpoint="/api/admin/schedules"
          submitLabel={t("common.add")}
          fields={[
            { name: "classroom_id", label: t("common.room"), type: "select", required: true, options: rooms.map((r) => ({ value: r.id, label: r.room_code })) },
            { name: "subject", label: t("attendance.subject"), required: true },
            { name: "teacher_id", label: t("sched.teacher"), type: "select", options: teachers.map((x) => ({ value: x.id, label: x.display_name })) },
            { name: "day_of_week", label: t("sched.day"), type: "select", required: true, options: days, defaultValue: String(todayDow) },
            { name: "start_time", label: t("sched.start"), type: "time", required: true },
            { name: "end_time", label: t("sched.end"), type: "time", required: true },
            { name: "present_until_min", label: t("sched.presentUntil"), type: "number", defaultValue: "10" },
            { name: "absent_after_min", label: t("sched.absentAfter"), type: "number", defaultValue: "30" },
          ]}
        />
      </Card>
      <Table head={[t("common.room"), t("attendance.subject"), t("sched.day"), `${t("sched.start")}–${t("sched.end")}`, `${t("attendance.PRESENT")} / ${t("attendance.ABSENT")}`, t("sched.teacher"), t("sched.startAgo")]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2 font-mono text-white">{r.room_code}</td>
            <td className="px-3 py-2 text-ink-100">{r.subject}</td>
            <td className="px-3 py-2 text-ink-300">{t(`day.${r.day_of_week}` as "day.0")}</td>
            <td className="px-3 py-2 font-mono text-ink-100">{r.start_time}–{r.end_time}</td>
            <td className="px-3 py-2 text-xs text-ink-300">≤{r.present_until_min} / &gt;{r.absent_after_min} min</td>
            <td className="px-3 py-2 text-ink-300">{r.teacher ?? "—"}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <AdminForm endpoint={`/api/admin/schedules/${r.id}`} method="PATCH" submitLabel={t("sched.set")} className="flex items-end gap-2"
                  fields={[{ name: "start_minutes_ago", label: "N", type: "number", required: true, placeholder: "0" }]} />
                <RowAction endpoint={`/api/admin/schedules/${r.id}`} method="DELETE" label={t("common.delete")} variant="danger" confirm="Delete this class?" />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

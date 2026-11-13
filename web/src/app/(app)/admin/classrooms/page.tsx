import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { AdminForm } from "@/components/AdminForm";
import { TeacherAssign } from "./TeacherAssign";
import { Card, PageTitle, Table } from "@/components/ui";

export const metadata = { title: "Classrooms" };
export const dynamic = "force-dynamic";

export default async function ClassroomsPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const rooms = await db()<{ id: string; room_code: string; name: string; capacity: number; teacher_ids: string[]; students: number }[]>`
    select c.id, c.room_code, c.name, c.capacity,
           coalesce(array_agg(tc.teacher_id) filter (where tc.teacher_id is not null), '{}') as teacher_ids,
           (select count(*)::int from students s where s.classroom_id = c.id) as students
      from classrooms c left join teacher_classrooms tc on tc.classroom_id = c.id
     group by c.id order by c.room_code`;
  const teachers = await db()<{ id: string; display_name: string }[]>`select id, display_name from users where role = 'teacher' and is_active order by display_name`;
  return (
    <>
      <PageTitle>{t("nav.classrooms")}</PageTitle>
      <Card title={t("admin.createRoom")}>
        <AdminForm
          endpoint="/api/admin/classrooms"
          submitLabel={t("common.add")}
          fields={[
            { name: "room_code", label: t("admin.roomCode"), required: true, placeholder: "R-305" },
            { name: "name", label: t("common.name"), required: true },
            { name: "capacity", label: t("admin.capacity"), type: "number", defaultValue: "40" },
          ]}
        />
      </Card>
      <Table head={[t("admin.roomCode"), t("common.name"), t("admin.capacity"), t("nav.students"), t("admin.teachers")]}>
        {rooms.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2 font-mono text-white">{r.room_code}</td>
            <td className="px-3 py-2 text-ink-100">{r.name}</td>
            <td className="px-3 py-2 text-ink-300">{r.capacity}</td>
            <td className="px-3 py-2 text-ink-300">{r.students}</td>
            <td className="px-3 py-2"><TeacherAssign roomId={r.id} teachers={teachers} assigned={r.teacher_ids} saveLabel={t("common.save")} /></td>
          </tr>
        ))}
      </Table>
    </>
  );
}

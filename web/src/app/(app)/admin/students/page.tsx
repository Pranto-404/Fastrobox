import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { AdminForm, RowAction } from "@/components/AdminForm";
import { Badge, Card, PageTitle, Table } from "@/components/ui";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const sql = db();
  const students = await sql<{ id: string; student_code: string; full_name: string; room_code: string | null; username: string | null; guardians: string[]; faces: number; cards: string[]; consent: boolean }[]>`
    select s.id, s.student_code, s.full_name, c.room_code, u.username,
           coalesce((select array_agg(g.display_name) from guardian_student_links l join users g on g.id = l.guardian_id where l.student_id = s.id), '{}') as guardians,
           (select count(*)::int from face_embeddings f where f.student_id = s.id) as faces,
           coalesce((select array_agg(uid) from rfid_cards r where r.student_id = s.id), '{}') as cards,
           s.face_consent_at is not null as consent
      from students s left join classrooms c on c.id = s.classroom_id left join users u on u.id = s.user_id
     order by c.room_code nulls last, s.student_code`;
  const rooms = await sql<{ id: string; room_code: string }[]>`select id, room_code from classrooms order by room_code`;
  const studentUsers = await sql<{ id: string; username: string }[]>`
    select id, username from users where role = 'student' and id not in (select user_id from students where user_id is not null) order by username`;
  const guardians = await sql<{ id: string; display_name: string }[]>`select id, display_name from users where role = 'guardian' order by display_name`;
  return (
    <>
      <PageTitle>{t("nav.students")}</PageTitle>
      <Card title={t("common.add")}>
        <AdminForm
          endpoint="/api/admin/students"
          submitLabel={t("common.add")}
          fields={[
            { name: "student_code", label: t("students.code"), required: true, placeholder: "S1" },
            { name: "full_name", label: t("common.name"), required: true },
            { name: "full_name_bn", label: t("students.nameBn") },
            { name: "classroom_id", label: t("common.room"), type: "select", options: rooms.map((r) => ({ value: r.id, label: r.room_code })) },
            { name: "user_id", label: t("students.account"), type: "select", options: studentUsers.map((u) => ({ value: u.id, label: u.username })) },
            { name: "guardian_id", label: t("students.guardian"), type: "select", options: guardians.map((g) => ({ value: g.id, label: g.display_name })) },
          ]}
        />
      </Card>
      <Table head={[t("students.code"), t("common.name"), t("common.room"), t("students.account"), t("students.guardian"), t("cards.uid"), t("students.faces"), t("common.actions")]}>
        {students.map((s) => (
          <tr key={s.id}>
            <td className="px-3 py-2 font-mono text-white">{s.student_code}</td>
            <td className="px-3 py-2 text-ink-100">{s.full_name}</td>
            <td className="px-3 py-2 text-ink-300">{s.room_code ?? "—"}</td>
            <td className="px-3 py-2 font-mono text-xs text-ink-300">{s.username ?? "—"}</td>
            <td className="px-3 py-2 text-xs text-ink-300">{s.guardians.join(", ") || "—"}</td>
            <td className="px-3 py-2 font-mono text-xs text-ink-300">{s.cards.join(", ") || "—"}</td>
            <td className="px-3 py-2"><Badge t={s.faces >= 3 ? "safe" : "warn"}>{s.faces}</Badge>{s.consent && <Badge t="accent" className="ml-1">{t("students.consentGiven")}</Badge>}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {!s.consent && <RowAction endpoint={`/api/admin/students/${s.id}`} body={{ face_consent: true }} label={t("students.consent")} />}
                <RowAction endpoint={`/api/admin/students/${s.id}`} method="DELETE" variant="danger" label={t("students.delete")} confirm={t("students.deleteConfirm")} />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

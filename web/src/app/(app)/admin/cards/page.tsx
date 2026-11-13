import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { RowAction } from "@/components/AdminForm";
import { Badge, Card, PageTitle, Table } from "@/components/ui";
import { CardRegister } from "./CardRegister";

export const metadata = { title: "Cards & tags" };
export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const sql = db();
  const cards = await sql<{ id: string; uid: string; kind: string; status: string; owner: string | null; blocked_until: Date | null; blocked_reason: string | null }[]>`
    select r.id, r.uid, r.kind, r.status, coalesce(s.full_name || ' (' || s.student_code || ')', u.display_name) as owner,
           case when r.blocked_until > now() then r.blocked_until end as blocked_until, r.blocked_reason
      from rfid_cards r left join students s on s.id = r.student_id left join users u on u.id = r.user_id
     order by r.kind, r.uid`;
  const students = await sql<{ id: string; label: string }[]>`select id, student_code || ' · ' || full_name as label from students order by student_code`;
  const teachers = await sql<{ id: string; label: string }[]>`select id, display_name as label from users where role in ('teacher', 'admin') order by display_name`;
  return (
    <>
      <PageTitle>{t("nav.cards")}</PageTitle>
      <Card title={t("common.add")}>
        <p className="mb-3 text-sm text-ink-300">{t("cards.tapHint")}</p>
        <CardRegister
          students={students}
          teachers={teachers}
          labels={{ uid: t("cards.uid"), kind: t("cards.kind"), student: t("cards.studentCard"), tag: t("cards.teacherTag"), owner: t("cards.owner"), useLast: t("cards.useLastTap"), save: t("common.save") }}
        />
      </Card>
      <Table head={[t("cards.uid"), t("cards.kind"), t("cards.owner"), t("common.status"), t("common.actions")]}>
        {cards.map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2 font-mono text-white">{c.uid}</td>
            <td className="px-3 py-2"><Badge t={c.kind === "teacher_tag" ? "accent" : "neutral"}>{c.kind === "teacher_tag" ? t("cards.teacherTag") : t("cards.studentCard")}</Badge></td>
            <td className="px-3 py-2 text-ink-100">{c.owner ?? "—"}</td>
            <td className="px-3 py-2">
              {c.blocked_until ? (
                <Badge t="fire">{t("cards.blocked", { t: c.blocked_until.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }) })}</Badge>
              ) : (
                <Badge t={c.status === "active" ? "safe" : "offline"}>{c.status}</Badge>
              )}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {c.blocked_until && <RowAction endpoint={`/api/admin/cards/${c.id}`} body={{ unblock: true }} label={t("cards.unblock")} variant="primary" />}
                {c.kind === "student" && c.owner && <RowAction endpoint={`/api/admin/cards/${c.id}`} body={{ student_id: null }} label={t("cards.unlink")} />}
                <RowAction endpoint={`/api/admin/cards/${c.id}`} method="DELETE" label={t("cards.remove")} variant="danger" confirm="Remove this card?" />
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

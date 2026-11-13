import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { Badge, Card, PageTitle } from "@/components/ui";

export const metadata = { title: "My children" };

/** Guardian: linked children only — today's arrival with entry time, notices, history links. */
export default async function GuardianPage() {
  const user = await requirePageUser(["guardian"]);
  const { t } = await getT(user.preferred_locale);
  const kids = await db()<{ id: string; full_name: string; student_code: string; today_status: string | null; today_entry: Date | null; today_subject: string | null }[]>`
    select s.id, s.full_name, s.student_code,
           t.status as today_status, t.first_seen_at as today_entry, t.subject as today_subject
      from guardian_student_links g
      join students s on s.id = g.student_id
      left join lateral (
        select a.status, a.first_seen_at, cs.subject from attendance a join class_schedules cs on cs.id = a.schedule_id
         where a.student_id = s.id and a.class_date = (now() at time zone 'Asia/Dhaka')::date
         order by a.first_seen_at nulls last limit 1) t on true
     where g.guardian_id = ${user.id}
     order by s.full_name`;
  const notices = await db()<{ id: number; kind: string; message: string; created_at: Date }[]>`
    select n.id, n.kind, n.message, n.created_at from guardian_notifications n
     where n.guardian_id = ${user.id} order by n.created_at desc limit 50`;
  return (
    <>
      <PageTitle>{t("nav.children")}</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {kids.map((k) => (
          <Card key={k.id} title={`${k.full_name} · ${k.student_code}`}>
            <div className="text-sm text-ink-300">{t("guardian.todayArrival")}</div>
            {k.today_status ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge t={k.today_status === "PRESENT" ? "safe" : k.today_status === "LATE" ? "warn" : "fire"}>{t(`attendance.${k.today_status}` as "attendance.LATE")}</Badge>
                <span className="text-white">{k.today_entry ? k.today_entry.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }) : "—"}</span>
                <span className="text-ink-400">{k.today_subject}</span>
              </div>
            ) : (
              <p className="mt-1 text-ink-400">{t("guardian.notArrived")}</p>
            )}
            <Link href={`/students/${k.id}`} className="mt-3 inline-block text-sm text-cyan-300 hover:underline">{t("attendance.history")} →</Link>
          </Card>
        ))}
        {!kids.length && <Card><p className="text-ink-300">{t("common.noData")}</p></Card>}
      </div>
      <Card title={t("guardian.notices")}>
        {notices.length ? (
          <ul className="divide-y divide-ink-800 text-sm">
            {notices.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge t={n.kind === "LATE" ? "warn" : "fire"}>{t(`attendance.${n.kind}` as "attendance.LATE")}</Badge>
                <span className="text-white">{n.message}</span>
                <span className="ml-auto text-xs text-ink-400">{n.created_at.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-ink-400">{t("common.noData")}</p>}
      </Card>
    </>
  );
}

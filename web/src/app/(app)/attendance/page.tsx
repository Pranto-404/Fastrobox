import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { roomIdsFor } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { Badge, Card, PageTitle, Table } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

/** Teacher (own rooms) / Admin: today's attendance and the log of check-in images received (sizes only). */
export default async function AttendancePage() {
  const user = await requirePageUser(["admin", "teacher"]);
  const { t } = await getT(user.preferred_locale);
  const ids = await roomIdsFor(user);
  const all = ids === "all";
  const scope = all ? [] : ids;
  const sql = db();
  const rows = await sql<{ id: string; student_id: string; full_name: string; student_code: string; room_code: string; subject: string; status: string; first_seen_at: Date | null; method: string; face_verified: boolean }[]>`
    select a.id, s.id as student_id, s.full_name, s.student_code, c.room_code, cs.subject, a.status, a.first_seen_at, a.method, a.face_verified
      from attendance a join students s on s.id = a.student_id join class_schedules cs on cs.id = a.schedule_id
      join classrooms c on c.id = cs.classroom_id
     where a.class_date = (now() at time zone 'Asia/Dhaka')::date and (${all} or c.id = any(${scope}))
     order by c.room_code, cs.start_time, s.student_code`;
  const images = await sql<{ id: number; tapped_at: Date; card_uid: string; face_w: number | null; face_h: number | null; face_bytes: number | null; decision: string; reason: string; room_code: string | null }[]>`
    select a.id, a.tapped_at, a.card_uid, a.face_w, a.face_h, a.face_bytes, a.decision, a.reason, c.room_code
      from access_events a left join classrooms c on c.id = a.classroom_id
     where a.face_w is not null and (${all} or a.classroom_id = any(${scope}))
     order by a.tapped_at desc limit 50`;
  return (
    <>
      <AutoRefresh ms={3000} />
      <PageTitle>{t("attendance.title")} · {t("attendance.today")}</PageTitle>
      <Card>
        {rows.length ? (
          <Table head={[t("students.code"), t("common.name"), t("common.room"), t("attendance.subject"), t("common.status"), t("attendance.entryTime"), t("attendance.method")]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-white"><Link className="hover:underline" href={`/students/${r.student_id}`}>{r.student_code}</Link></td>
                <td className="px-3 py-2 text-ink-100">{r.full_name}</td>
                <td className="px-3 py-2 text-ink-300">{r.room_code}</td>
                <td className="px-3 py-2 text-ink-300">{r.subject}</td>
                <td className="px-3 py-2"><Badge t={r.status === "PRESENT" ? "safe" : r.status === "LATE" ? "warn" : "fire"}>{t(`attendance.${r.status}` as "attendance.LATE")}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs text-ink-300">{r.first_seen_at?.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }) ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-ink-300">{r.method}{!r.face_verified && r.method === "OFFLINE_CARD" && <span className="ml-1 text-yellow-200">· {t("attendance.faceNotVerified")}</span>}</td>
              </tr>
            ))}
          </Table>
        ) : <p className="text-ink-300">{t("attendance.none")}</p>}
      </Card>
      <Card title="Check-in images received (not stored)">
        <Table head={[t("common.time"), t("common.room"), t("cards.uid"), "w × h (px)", "bytes", t("common.result")]}>
          {images.map((i) => (
            <tr key={i.id}>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{i.tapped_at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
              <td className="px-3 py-2 text-ink-300">{i.room_code ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-white">{i.card_uid}</td>
              <td className="px-3 py-2 font-mono text-ink-100">{i.face_w} × {i.face_h}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{i.face_bytes}</td>
              <td className="px-3 py-2"><Badge t={i.decision === "GRANTED" ? "safe" : "fire"}>{i.reason.replaceAll("_", " ")}</Badge></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

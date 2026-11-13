import type { AttendanceRow } from "@/lib/attendanceQueries";
import type { DictKey } from "@/lib/i18n/dict";
import { Badge, Table } from "./ui";

type T = (k: DictKey, v?: Record<string, string | number>) => string;

export function AttendanceTable({ rows, t }: { rows: AttendanceRow[]; t: T }) {
  if (!rows.length) return <p className="text-ink-300">{t("attendance.none")}</p>;
  return (
    <Table head={[t("attendance.date"), t("attendance.subject"), t("common.room"), t("common.status"), t("attendance.entryTime"), t("attendance.method")]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="px-3 py-2 font-mono text-xs text-ink-300">{r.class_date}</td>
          <td className="px-3 py-2 text-white">{r.subject}</td>
          <td className="px-3 py-2 text-ink-300">{r.room_code}</td>
          <td className="px-3 py-2">
            <Badge t={r.status === "PRESENT" ? "safe" : r.status === "LATE" ? "warn" : "fire"}>{t(`attendance.${r.status}`)}</Badge>
          </td>
          <td className="px-3 py-2 font-mono text-xs text-ink-300">
            {r.first_seen_at ? r.first_seen_at.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }) : "—"}
          </td>
          <td className="px-3 py-2 text-xs text-ink-300">
            {r.method}
            {!r.face_verified && r.method === "OFFLINE_CARD" && <span className="ml-2 text-yellow-200">{t("attendance.faceNotVerified")}</span>}
          </td>
        </tr>
      ))}
    </Table>
  );
}

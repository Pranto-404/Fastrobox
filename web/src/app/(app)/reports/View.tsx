"use client";
import { useState } from "react";
import useSWR from "swr";
import { Download } from "lucide-react";
import type { DailyReport } from "@/lib/reports";
import { useT } from "@/components/i18n-client";
import { fetchJson } from "@/components/live";
import { RoomPicker } from "@/components/RoomPicker";
import { Card, inputCls, SimBadge, Stat, Table } from "@/components/ui";

const todayDhaka = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

export function View({ rooms }: { rooms: { id: string; room_code: string }[] }) {
  const { t } = useT();
  const [room, setRoom] = useState(rooms[0]?.id ?? "");
  const [date, setDate] = useState(todayDhaka());
  const q = `room=${room}&date=${date}`;
  const { data: r, error } = useSWR<DailyReport>(room ? `/api/reports/daily?${q}` : null, fetchJson, { refreshInterval: 5000 });
  const f = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  if (!rooms.length) return <Card><p className="text-ink-300">{t("common.noData")}</p></Card>;
  return (
    <Card action={<a className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline" href={`/api/reports/daily?${q}&format=csv`}><Download className="size-4" />{t("common.exportCsv")}</a>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <RoomPicker rooms={rooms} value={room} onChange={setRoom} label={t("common.room")} />
        <div><label htmlFor="rdate" className="mb-1 block text-xs text-ink-300">{t("report.date")}</label>
          <input id="rdate" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      {error && <p className="text-red-300">{t("common.error")}</p>}
      {r && (
        <div className="space-y-5">
          {r.simulated && <SimBadge label={t("common.simulated")} />}
          {r.readings === 0 && <p className="text-ink-300">{t("common.noData")}</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`${t("room.temperature")} · ${t("report.min")}`} value={f(r.temp.min)} unit="°C" />
            <Stat label={`${t("room.temperature")} · ${t("report.max")}`} value={f(r.temp.max)} unit="°C" t="danger" hint={r.temp.max_at ? new Date(r.temp.max_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" }) : undefined} />
            <Stat label={`${t("room.temperature")} · ${t("report.avg")}`} value={f(r.temp.avg)} unit="°C" />
            <Stat label={t("report.readings")} value={r.readings} />
            <Stat label={`${t("room.humidity")} · ${t("report.min")}`} value={f(r.rh.min)} unit="%" />
            <Stat label={`${t("room.humidity")} · ${t("report.max")}`} value={f(r.rh.max)} unit="%" />
            <Stat label={`${t("room.humidity")} · ${t("report.avg")}`} value={f(r.rh.avg)} unit="%" />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold text-ink-300 uppercase">{t("report.alarms")}</h3>
              <Table head={[t("common.status"), "#"]}>
                {Object.entries(r.alarms).map(([k, v]) => (
                  <tr key={k}><td className="px-3 py-2 text-ink-100">{t(`alert.${k}` as "alert.FIRE")}</td><td className="px-3 py-2 font-mono text-white">{v}</td></tr>
                ))}
              </Table>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold text-ink-300 uppercase">{t("attendance.title")}</h3>
              <Table head={[t("common.status"), "#"]}>
                {(["PRESENT", "LATE", "ABSENT"] as const).map((k) => (
                  <tr key={k}><td className="px-3 py-2 text-ink-100">{t(`attendance.${k}`)}</td><td className="px-3 py-2 font-mono text-white">{r.attendance[k]}</td></tr>
                ))}
              </Table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

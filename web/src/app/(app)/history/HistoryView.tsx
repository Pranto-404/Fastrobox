"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { useT } from "@/components/i18n-client";
import { fetchJson } from "@/components/live";
import { RoomPicker } from "@/components/RoomPicker";
import { Badge, Card, inputCls, SimBadge, Table } from "@/components/ui";

const EVENT_TYPES = ["FIRE", "PANIC", "STATUS", "FIRE_CLEARED", "SILENCED", "CARD_TAP", "ENTRY_GRANTED", "ENTRY_DENIED", "NO_FACE", "SENSOR_ERROR", "BOOT", "SETTINGS_APPLIED", "OFFLINE_ENTRY", "DEVICE_OFFLINE", "DEVICE_ONLINE", "WEATHER_ALERT", "FACE_MISMATCH", "CARD_BLOCKED", "ACK"];

interface Reading { recorded_at: string; temp_c: number | null; rh: number | null; heat_index_c: number | null; quality: string; is_simulated: boolean }
interface Ev { id: number; recorded_at: string; event_type: string; detail: string; origin: string; seq: number | null; device_uid: string | null; is_offline_replay: boolean; is_simulated: boolean }

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function HistoryView({ rooms }: { rooms: { id: string; room_code: string }[] }) {
  const { t } = useT();
  const [room, setRoom] = useState(rooms[0]?.id ?? "");
  const [hours, setHours] = useState(6);
  const [types, setTypes] = useState<string[]>(["FIRE", "PANIC"]);
  const [evFrom, setEvFrom] = useState(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [evTo, setEvTo] = useState(toLocalInput(new Date(Date.now() + 60_000)));
  const rq = useMemo(() => {
    const to = new Date();
    return `room=${room}&from=${new Date(to.getTime() - hours * 3600_000).toISOString()}&to=${to.toISOString()}`;
  }, [room, hours]);
  const eq = `room=${room}&from=${new Date(evFrom).toISOString()}&to=${new Date(evTo).toISOString()}&types=${types.join(",")}`;
  const { data: rd } = useSWR<{ readings: Reading[] }>(room ? `/api/history/readings?${rq}` : null, fetchJson, { refreshInterval: 10_000 });
  const { data: ev } = useSWR<{ events: Ev[] }>(room ? `/api/history/events?${eq}` : null, fetchJson, { refreshInterval: 5_000 });
  const points = (rd?.readings ?? []).filter((r) => r.quality === "good").map((r) => ({
    t: new Date(r.recorded_at).getTime(), temp: r.temp_c, rh: r.rh, hi: r.heat_index_c,
  }));
  const peak = points.reduce<{ t: number; temp: number | null } | null>((a, p) => (p.temp != null && (!a || (a.temp ?? -1e9) < p.temp) ? p : a), null);
  if (!rooms.length) return <Card><p className="text-ink-300">{t("common.noData")}</p></Card>;
  return (
    <div className="space-y-5">
      <Card title={t("history.chart")} action={
        <a className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline" href={`/api/history/readings?${rq}&format=csv`}><Download className="size-4" />{t("common.exportCsv")}</a>
      }>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <RoomPicker rooms={rooms} value={room} onChange={setRoom} label={t("common.room")} />
          <div>
            <label htmlFor="hrs" className="mb-1 block text-xs text-ink-300">{t("history.hours")}</label>
            <select id="hrs" className={inputCls} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}
            </select>
          </div>
          {peak && <div className="self-end text-sm text-ink-300">{t("report.max")}: <span className="font-semibold text-orange-300">{peak.temp}°C</span> · {new Date(peak.t).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })}</div>}
        </div>
        {rd?.readings.some((r) => r.is_simulated) && <div className="mb-2"><SimBadge label={t("common.simulated")} /></div>}
        <div className="h-80" role="img" aria-label={t("history.chart")}>
          {points.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#1b2d52" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} stroke="#6b7fa8" fontSize={12}
                  tickFormatter={(v) => new Date(v).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" })} />
                <YAxis stroke="#6b7fa8" fontSize={12} />
                <Tooltip contentStyle={{ background: "#0a1428", border: "1px solid #2a3f6a", borderRadius: 8 }} labelFormatter={(v) => new Date(Number(v)).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} />
                <Legend />
                <Line type="monotone" dataKey="temp" name={`${t("room.temperature")} °C`} stroke="#f97316" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="hi" name={`${t("room.heatIndex")} °C`} stroke="#ef4444" dot={false} strokeDasharray="4 3" isAnimationActive={false} />
                <Line type="monotone" dataKey="rh" name={`${t("room.humidity")} %`} stroke="#22d3ee" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p className="text-ink-400">{t("common.noData")}</p>}
        </div>
      </Card>
      <Card title={t("history.events")} action={
        <a className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline" href={`/api/history/events?${eq}&format=csv`}><Download className="size-4" />{t("common.exportCsv")}</a>
      }>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="evf" className="mb-1 block text-xs text-ink-300">{t("common.from")}</label><input id="evf" type="datetime-local" className={inputCls} value={evFrom} onChange={(e) => setEvFrom(e.target.value)} /></div>
          <div><label htmlFor="evt" className="mb-1 block text-xs text-ink-300">{t("common.to")}</label><input id="evt" type="datetime-local" className={inputCls} value={evTo} onChange={(e) => setEvTo(e.target.value)} /></div>
        </div>
        <fieldset className="mb-4 flex flex-wrap gap-2">
          <legend className="mb-1 text-xs text-ink-300">{t("history.types")}</legend>
          {EVENT_TYPES.map((ty) => (
            <label key={ty} className={`cursor-pointer rounded-full px-2.5 py-1 text-xs ring-1 ${types.includes(ty) ? "bg-cyan-500/20 text-cyan-100 ring-cyan-500/50" : "text-ink-300 ring-ink-600"}`}>
              <input type="checkbox" className="sr-only" checked={types.includes(ty)} onChange={(e) => setTypes((s) => (e.target.checked ? [...s, ty] : s.filter((x) => x !== ty)))} />
              {ty}
            </label>
          ))}
          <button type="button" className="text-xs text-cyan-300 hover:underline" onClick={() => setTypes([])}>{t("history.allTypes")}</button>
        </fieldset>
        <Table head={[t("common.time"), t("cards.kind"), t("common.reason"), t("common.device"), "seq / id"]}>
          {(ev?.events ?? []).map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-300">{new Date(e.recorded_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
              <td className="px-3 py-2"><Badge t={e.event_type === "FIRE" ? "fire" : e.event_type === "PANIC" ? "panic" : "neutral"}>{e.event_type}</Badge>{e.is_offline_replay && <Badge t="warn" className="ml-1">offline</Badge>}{e.is_simulated && <SimBadge label="SIM" />}</td>
              <td className="px-3 py-2 text-ink-100">{e.detail}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{e.device_uid ?? e.origin}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink-400">{e.seq ?? `#${e.id}`}</td>
            </tr>
          ))}
        </Table>
        {ev && ev.events.length === 0 && <p className="mt-3 text-sm text-ink-400">{t("common.noData")}</p>}
      </Card>
    </div>
  );
}

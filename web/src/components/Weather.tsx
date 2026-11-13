"use client";
import { useState } from "react";
import { mutate } from "swr";
import { CloudSun, AlertTriangle } from "lucide-react";
import type { WeatherPayload } from "@/lib/weather";
import { useT } from "./i18n-client";
import { useLive } from "./live";
import { Badge, Button, Card, inputCls, type Tone } from "./ui";

export interface WeatherView {
  data: WeatherPayload | null;
  source: string;
  fetched_at: string | null;
  age_s: number | null;
  stale: boolean;
  notices: { id: number; level: "ADVISORY" | "WARNING" | "DANGER"; kind: string; origin: string; message: string; valid_from: string; valid_to: string | null; source: string }[];
}

const levelTone: Record<string, Tone> = { ADVISORY: "accent", WARNING: "warn", DANGER: "fire" };

/** Compact strip shown on every dashboard (Level 6, task 1). */
export function WeatherStrip() {
  const { t } = useT();
  const { data } = useLive<WeatherView>("/api/weather", 60_000);
  if (!data) return null;
  if (!data.data) return <p className="text-xs text-ink-400">{t("weather.unavailable")}</p>;
  const c = data.data.current;
  return (
    <a href="/weather" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-ink-700/60 bg-ink-900/60 px-4 py-2 text-sm hover:border-cyan-500/50">
      <CloudSun className="size-4 text-cyan-300" aria-hidden />
      <span className="text-white">{data.data.line}</span>
      <span className="text-ink-300">{t("weather.feels")} {c.apparent_c.toFixed(0)}°C</span>
      {data.notices.length > 0 && <Badge t={levelTone[data.notices[0].level]}><AlertTriangle className="size-3" />{data.notices.length}</Badge>}
      <span className="ml-auto text-xs text-ink-400">{t("weather.age", { m: Math.round((data.age_s ?? 0) / 60) })}</span>
      {data.stale && <Badge t="warn">{t("weather.stale")}</Badge>}
    </a>
  );
}

export function WeatherFull({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useT();
  const { data, error } = useLive<WeatherView>("/api/weather", 10_000);
  const [msg, setMsg] = useState<string | null>(null);
  if (error) return <Card><p className="text-red-300">{t("common.error")}</p></Card>;
  if (!data) return <Card><p className="text-ink-300">{t("common.loading")}</p></Card>;
  const w = data.data;
  return (
    <div className="space-y-5">
      <Card
        title={t("weather.title")}
        action={<span className="flex items-center gap-2 text-xs text-ink-400">{t("weather.source")}: {data.source} · {t("weather.age", { m: Math.round((data.age_s ?? 0) / 60) })}{data.stale && <Badge t="warn">{t("weather.stale")}</Badge>}</span>}
      >
        {!w ? (
          <p className="text-ink-300">{t("weather.unavailable")}</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-6">
              <div className="text-5xl font-semibold text-white">{w.current.temp_c.toFixed(0)}°C</div>
              <div className="text-ink-300">
                <div>{w.line}</div>
                <div>{t("weather.feels")} {w.current.apparent_c.toFixed(0)}°C · {t("room.humidity")} {w.current.rh.toFixed(0)}% · {w.current.wind_kmh.toFixed(0)} km/h</div>
              </div>
            </div>
            <h3 className="mb-2 text-xs font-semibold text-ink-300 uppercase">{t("weather.forecast")}</h3>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {w.hourly.map((h) => (
                <div key={h.time} className="min-w-16 rounded-lg bg-ink-850 px-2 py-2 text-center text-xs">
                  <div className="text-ink-400">{new Date(h.time).toLocaleTimeString("en-GB", { hour: "2-digit", timeZone: "Asia/Dhaka" })}</div>
                  <div className="mt-1 font-semibold text-white">{h.temp_c.toFixed(0)}°</div>
                  <div className="text-cyan-300">{h.precip_prob}%</div>
                  <div className="text-ink-400">{h.gust_kmh.toFixed(0)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      <Card title={t("weather.notices")}>
        {data.notices.length === 0 ? <p className="text-ink-300">{t("weather.noNotices")}</p> : (
          <ul className="space-y-2">
            {data.notices.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 p-3 text-sm">
                <Badge t={levelTone[n.level]}>{n.level}</Badge>
                <Badge>{n.origin === "derived" ? t("weather.derived") : n.origin === "test" ? t("weather.test") : t("weather.official")}</Badge>
                <span className="text-white">{n.message}</span>
                <span className="text-xs text-ink-400">
                  {new Date(n.valid_from).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })} → {n.valid_to ? new Date(n.valid_to).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) : "—"} · {n.source}
                </span>
                {isAdmin && n.origin === "test" && (
                  <Button variant="ghost" className="ml-auto px-2 py-1 text-xs" onClick={async () => {
                    await fetch(`/api/weather/notices/${n.id}`, { method: "DELETE" });
                    await mutate("/api/weather");
                    await mutate("/api/live/banner");
                  }}>{t("weather.remove")}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <form className="mt-4 grid gap-2 sm:grid-cols-[10rem_1fr_auto]" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/weather/notices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ level: fd.get("level"), message: fd.get("message") }) });
            setMsg(res.ok ? "✓" : "✗");
            await mutate("/api/weather");
            await mutate("/api/live/banner");
          }}>
            <label className="sr-only" htmlFor="wlevel">{t("weather.level")}</label>
            <select id="wlevel" name="level" className={inputCls} defaultValue="DANGER">
              <option>ADVISORY</option><option>WARNING</option><option>DANGER</option>
            </select>
            <label className="sr-only" htmlFor="wmsg">{t("weather.message")}</label>
            <input id="wmsg" name="message" required minLength={3} maxLength={200} placeholder={t("weather.message")} className={inputCls} />
            <Button type="submit">{t("weather.addTest")}</Button>
            {msg && <span className="text-xs text-cyan-200">{msg}</span>}
          </form>
        )}
      </Card>
    </div>
  );
}

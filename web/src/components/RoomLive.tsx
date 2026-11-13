"use client";
import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { mutate } from "swr";
import { Activity, CreditCard, DoorClosed, DoorOpen, Droplets, Flame, Thermometer, TrendingDown, TrendingUp, Minus, Wifi, WifiOff, RefreshCw } from "lucide-react";
import type { RoomLive } from "@/lib/dashboard";
import { useAgo, useT } from "./i18n-client";
import { fetchJson, FetchError, useLive } from "./live";
import { Badge, Button, Card, SimBadge, Stat, type Tone } from "./ui";

const statusTone: Record<string, Tone> = { SAFE: "safe", WARNING: "warn", DANGER: "danger", FIRE: "fire" };

function fmt(v: number | null | undefined, d = 1) {
  return v == null ? "—" : v.toFixed(d);
}

function uptime(s: number | null) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function StatusHero({ room }: { room: RoomLive }) {
  const { t } = useT();
  const r = room.reading;
  const d = room.device;
  const offline = !d || d.connection !== "online";
  const st = r?.status ?? "UNKNOWN";
  const panic = d?.panic_active;
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl p-5 ring-1",
        offline ? "bg-slate-800/60 ring-slate-600" :
        st === "FIRE" ? "frx-flash bg-red-600/90 ring-red-400" :
        panic ? "bg-purple-700/70 ring-purple-400" :
        st === "DANGER" ? "bg-orange-600/30 ring-orange-400/60" :
        st === "WARNING" ? "bg-yellow-500/15 ring-yellow-400/50" : "bg-green-500/10 ring-green-500/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs font-medium tracking-widest text-white/70 uppercase">{t("common.status")}</div>
          <div className="text-3xl font-bold text-white sm:text-4xl">
            {offline ? t("conn.OFFLINE") : panic ? t("status.PANIC") : t(`status.${st}` as "status.SAFE")}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {d && (
            <Badge t={d.net === "LIVE" ? "accent" : d.net === "SYNCING" ? "warn" : "offline"}>
              {d.net === "LIVE" ? <span className="frx-live-dot size-2 rounded-full bg-cyan-300" /> : d.net === "SYNCING" ? <RefreshCw className="size-3" /> : <WifiOff className="size-3" />}
              {t(`conn.${d.net}`)}
            </Badge>
          )}
          {(r?.is_simulated || d?.is_simulated) && <SimBadge label={t("common.simulated")} />}
        </div>
      </div>
    </div>
  );
}

export function RoomStats({ room }: { room: RoomLive }) {
  const { t } = useT();
  const r = room.reading;
  const TrendIcon = r?.heat_trend === "RISING" ? TrendingUp : r?.heat_trend === "FALLING" ? TrendingDown : Minus;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label={<span className="inline-flex items-center gap-1"><Thermometer className="size-3.5" />{t("room.temperature")}</span>} value={fmt(r?.temp_c)} unit="°C" t={statusTone[r?.status ?? ""]} />
      <Stat label={<span className="inline-flex items-center gap-1"><Droplets className="size-3.5" />{t("room.humidity")}</span>} value={fmt(r?.rh, 0)} unit="%" />
      <Stat label={t("room.heatIndex")} value={fmt(r?.heat_index_c)} unit="°C" />
      <Stat
        label={t("room.trend")}
        value={<span className="inline-flex items-center gap-2 text-xl"><TrendIcon className="size-5" />{r?.heat_trend ? t(`trend.${r.heat_trend}` as "trend.STABLE") : "—"}</span>}
      />
      <Stat
        label={<span className="inline-flex items-center gap-1"><Flame className="size-3.5" />{t("room.fire")}</span>}
        value={<span className="text-xl">{room.device?.fire_latched || r?.flame ? t("room.fireLatched") : t("room.noFire")}</span>}
        t={room.device?.fire_latched || r?.flame ? "fire" : undefined}
        hint={`${t("room.flame")}: ${r ? (r.flame ? "1" : "0") : "—"}`}
      />
      <Stat
        label={t("room.door")}
        value={<span className="inline-flex items-center gap-2 text-xl">{r?.door === "UNLOCKED" ? <DoorOpen className="size-5" /> : <DoorClosed className="size-5" />}{r ? t(`door.${r.door}`) : "—"}</span>}
      />
      <Stat label={t("room.quality")} value={<span className="text-xl">{r ? t(`quality.${r.quality}`) : "—"}</span>} t={r?.quality === "bad" ? "warn" : undefined} />
      <Stat
        label={t("room.limits")}
        value={<span className="text-xl">{room.limits.temp_warning_c}° / {room.limits.temp_danger_c}°</span>}
        hint={`v${room.limits.version}${room.limits.applied_version === room.limits.version ? " ✓" : room.limits.version ? ` (${t("settings.state.pending")})` : ""}`}
      />
    </div>
  );
}

export function HealthPanel({ room }: { room: RoomLive }) {
  const { t } = useT();
  const ago = useAgo();
  const r = room.reading;
  const d = room.device;
  if (!d) return null;
  const rows: [string, React.ReactNode][] = [
    [t("health.lastSeen"), ago(d.last_seen_at)],
    [t("health.uptime"), uptime(r?.uptime_s ?? null)],
    [t("health.rssi"), r?.rssi != null ? `${r.rssi} dBm` : "—"],
    [t("health.heap"), r?.heap_kb != null ? `${r.heap_kb} KB` : "—"],
    [t("health.chipTemp"), r?.chip_temp_c != null ? `${fmt(r.chip_temp_c)} °C` : "—"],
    [t("health.fw"), r?.fw ?? d.firmware_version ?? "—"],
    [t("health.resetReason"), d.last_reset_reason ?? "—"],
    [t("health.pending"), String(d.sync_pending)],
  ];
  return (
    <Card title={<span className="inline-flex items-center gap-2"><Activity className="size-4" />{t("health.title")} · {d.device_uid}</span>}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-ink-800 py-1.5">
            <dt className="text-ink-400">{k}</dt>
            <dd className="font-mono text-ink-100 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function RecentTaps({ room }: { room: RoomLive }) {
  const { t } = useT();
  return (
    <Card title={<span className="inline-flex items-center gap-2"><CreditCard className="size-4" />{t("room.recentTaps")}</span>}>
      {room.recent_taps.length === 0 ? (
        <p className="text-sm text-ink-400">{t("common.noData")}</p>
      ) : (
        <ul className="divide-y divide-ink-800 text-sm">
          {room.recent_taps.map((x, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-mono text-ink-100">{x.uid || "—"}</span>
              {x.name && <span className="text-ink-300">{x.name}</span>}
              {x.decision && <Badge t={x.decision === "GRANTED" ? "safe" : "fire"}>{x.reason?.replaceAll("_", " ")}</Badge>}
              {x.offline && <Badge t="warn">{t("attendance.faceNotVerified")}</Badge>}
              <span className="ml-auto text-xs text-ink-400">{new Date(x.at).toLocaleTimeString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FireReset({ room, canReset }: { room: RoomLive; canReset: boolean }) {
  const { t } = useT();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const d = room.device;
  if (!d || !canReset) return null;
  const fr = room.fire_reset;
  const pending = fr && (fr.status === "pending" || fr.status === "delivered");
  const recentlyDone = fr?.status === "applied" && fr.completed_at && Date.now() - new Date(fr.completed_at).getTime() < 60_000;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="danger"
        disabled={!d.fire_latched || Boolean(pending) || busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await fetchJson(`/api/devices/${d.id}/fire-reset`, { method: "POST" });
            await mutate(`/api/rooms/${room.classroom.id}/live`);
          } catch (e) {
            setErr(e instanceof FetchError ? ((e.body as { error?: { message?: string } })?.error?.message ?? t("common.error")) : t("common.error"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Flame className="size-4" />
        {t("room.resetFire")}
      </Button>
      {pending && <Badge t="warn">{t("room.resetFirePending")}</Badge>}
      {recentlyDone && <Badge t="safe">{t("room.resetFireDone")}</Badge>}
      {fr && (fr.status === "failed" || fr.status === "rejected") && <Badge t="fire">{fr.message ?? fr.status}</Badge>}
      {err && <span role="alert" className="text-sm text-red-300">{err}</span>}
    </div>
  );
}

export function RoomLiveView({ id, canReset }: { id: string; canReset: boolean }) {
  const { t } = useT();
  const ago = useAgo();
  const { data, error } = useLive<RoomLive>(`/api/rooms/${id}/live`);
  if (error) return <Card><p role="alert" className="text-red-300">{t("common.error")}</p></Card>;
  if (!data) return <Card><p className="text-ink-300">{t("common.loading")}</p></Card>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">{data.classroom.name}</h1>
          <p className="text-sm text-ink-300">
            {t("common.room")} {data.classroom.room_code} · {t("room.lastUpdate")}: {ago(data.reading?.recorded_at)}
          </p>
        </div>
        <FireReset room={data} canReset={canReset} />
      </div>
      {!data.device ? (
        <Card><p className="text-ink-300">{t("room.noDevice")}</p></Card>
      ) : (
        <>
          <StatusHero room={data} />
          <RoomStats room={data} />
          <div className="grid gap-5 xl:grid-cols-2">
            <HealthPanel room={data} />
            <RecentTaps room={data} />
          </div>
        </>
      )}
    </div>
  );
}

export function RoomsGrid() {
  const { t } = useT();
  const ago = useAgo();
  const { data, error } = useLive<{ rooms: RoomLive[] }>("/api/live/rooms");
  if (error) return <Card><p role="alert" className="text-red-300">{t("common.error")}</p></Card>;
  if (!data) return <Card><p className="text-ink-300">{t("common.loading")}</p></Card>;
  if (!data.rooms.length) return <Card><p className="text-ink-300">{t("common.noData")}</p></Card>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {data.rooms.map((room) => {
        const r = room.reading;
        const d = room.device;
        return (
          <Link key={room.classroom.id} href={`/rooms/${room.classroom.id}`} className="group block rounded-2xl focus-visible:outline-2">
            <Card className="h-full transition group-hover:border-cyan-500/50">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold text-white">{room.classroom.name}</div>
                  <div className="text-xs text-ink-400">{room.classroom.room_code} · {d?.device_uid ?? t("room.noDevice")}</div>
                </div>
                <div className="flex items-center gap-2">
                  {d && (d.connection === "online" ? <Wifi className="size-4 text-cyan-300" aria-label={t("conn.online")} /> : <WifiOff className="size-4 text-slate-400" aria-label={t("conn.offline")} />)}
                  {room.open_alerts > 0 && <Badge t="fire">{room.open_alerts} {t("alerts.open")}</Badge>}
                </div>
              </div>
              <StatusHero room={room} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div><div className="text-ink-400 text-xs">{t("room.temperature")}</div><div className="font-semibold text-white">{fmt(r?.temp_c)}°C</div></div>
                <div><div className="text-ink-400 text-xs">{t("room.humidity")}</div><div className="font-semibold text-white">{fmt(r?.rh, 0)}%</div></div>
                <div><div className="text-ink-400 text-xs">{t("room.door")}</div><div className="font-semibold text-white">{r ? t(`door.${r.door}`) : "—"}</div></div>
              </div>
              <div className="mt-2 text-right text-xs text-ink-400">{ago(r?.recorded_at)}</div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

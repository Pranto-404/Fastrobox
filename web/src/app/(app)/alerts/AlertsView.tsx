"use client";
import { useState } from "react";
import { mutate } from "swr";
import { Check, ImageIcon } from "lucide-react";
import { useT } from "@/components/i18n-client";
import { fetchJson, FetchError, useLive } from "@/components/live";
import { Badge, Button, Card, SimBadge, type Tone } from "@/components/ui";

interface AlertRow {
  id: number; alert_type: string; severity: "info" | "warning" | "critical"; title: string; message: string;
  status: "open" | "acknowledged" | "resolved"; created_at: string; acknowledged_at: string | null;
  acknowledged_by_name: string | null; is_simulated: boolean; snapshot_id: string | null; room_code: string | null; read: boolean;
}

const sevTone: Record<string, Tone> = { critical: "fire", warning: "warn", info: "accent" };

export function AlertsView() {
  const { t } = useT();
  const [filter, setFilter] = useState<"open" | "">("open");
  const url = `/api/alerts${filter ? `?status=${filter}` : ""}`;
  const { data, error } = useLive<{ alerts: AlertRow[] }>(url, 2000);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [snap, setSnap] = useState<string | null>(null);

  async function ack(a: AlertRow) {
    try {
      const r = await fetchJson<{ by: string; at: string }>(`/api/alerts/${a.id}/ack`, { method: "POST" });
      setMsg((m) => ({ ...m, [a.id]: t("alerts.acked", { name: r.by, time: new Date(r.at).toLocaleTimeString() }) }));
    } catch (e) {
      if (e instanceof FetchError && e.status === 409) {
        const d = (e.body as { error: { details: { by: string; at: string } } }).error.details;
        setMsg((m) => ({ ...m, [a.id]: t("alerts.alreadyAcked", { name: d.by, time: new Date(d.at).toLocaleTimeString() }) }));
      } else setMsg((m) => ({ ...m, [a.id]: t("common.error") }));
    }
    await mutate(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist">
        {(["open", ""] as const).map((f) => (
          <button key={f || "all"} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f ? "bg-cyan-500/20 text-cyan-200" : "text-ink-300 hover:bg-ink-800"}`}>
            {f === "open" ? t("alerts.open") : t("nav.history")}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-red-300">{t("common.error")}</p>}
      {!data && !error && <p className="text-ink-300">{t("common.loading")}</p>}
      {data && data.alerts.length === 0 && <Card><p className="text-ink-300">{t("alerts.none")}</p></Card>}
      <ul className="space-y-3">
        {data?.alerts.map((a) => (
          <li key={a.id}>
            <Card className={a.status === "open" && a.severity === "critical" ? "border-red-500/50" : ""}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge t={sevTone[a.severity]}>{t(`alert.${a.alert_type}` as "alert.FIRE")}</Badge>
                    {a.room_code && <Badge>{a.room_code}</Badge>}
                    {!a.read && a.status === "open" && <Badge t="accent">{t("alerts.unread")}</Badge>}
                    {a.is_simulated && <SimBadge label={t("common.simulated")} />}
                    <span className="text-xs text-ink-400">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-white">{a.title}</p>
                  <p className="text-sm text-ink-300">{a.message}</p>
                  {a.status !== "open" && a.acknowledged_by_name && (
                    <p className="mt-1 text-xs text-green-300">{t("alerts.acked", { name: a.acknowledged_by_name, time: new Date(a.acknowledged_at!).toLocaleTimeString() })}</p>
                  )}
                  {a.status === "resolved" && !a.acknowledged_by_name && <p className="mt-1 text-xs text-ink-400">{t("alerts.resolved")}</p>}
                  {msg[a.id] && <p role="status" className="mt-1 text-sm text-cyan-200">{msg[a.id]}</p>}
                </div>
                <div className="flex gap-2">
                  {a.snapshot_id && (
                    <Button variant="ghost" onClick={() => setSnap(a.snapshot_id)}><ImageIcon className="size-4" />{t("alerts.snapshot")}</Button>
                  )}
                  {a.status === "open" && <Button onClick={() => ack(a)}><Check className="size-4" />{t("alerts.ack")}</Button>}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {snap && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setSnap(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/snapshots/${snap}`} alt={t("alerts.snapshot")} className="max-h-[80vh] rounded-xl ring-1 ring-ink-600" />
        </div>
      )}
    </div>
  );
}

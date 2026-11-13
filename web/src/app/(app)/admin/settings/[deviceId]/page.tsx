import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { currentSettings, settingsHistory } from "@/lib/settings";
import { AdminForm } from "@/components/AdminForm";
import { Badge, Card, PageTitle, Table, type Tone } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";

export const metadata = { title: "Device settings" };
export const dynamic = "force-dynamic";

const stateTone: Record<string, Tone> = { pending: "warn", delivered: "accent", applied: "safe", failed: "fire", rejected: "fire", expired: "offline" };

/** Admin only (Level 5). A Teacher opening this address gets HTTP 403. */
export default async function DeviceSettingsPage({ params }: { params: Promise<{ deviceId: string }> }) {
  const me = await requirePageUser(["admin"]);
  const { deviceId } = await params;
  if (!z.uuid().safeParse(deviceId).success) notFound();
  const [d] = await db()<{ device_uid: string; room_id: string | null }[]>`select device_uid, room_id from devices where id = ${deviceId}`;
  if (!d) notFound();
  const { t } = await getT(me.preferred_locale);
  const cur = await currentSettings(deviceId);
  const hist = await settingsHistory(deviceId);
  return (
    <>
      <AutoRefresh ms={2000} />
      <PageTitle sub={`${d.device_uid} · ${d.room_id ?? "—"}`}>{t("settings.title")}</PageTitle>
      <Card title={`${t("settings.current")}: v${cur.version}`}>
        <p className="mb-4 text-sm text-ink-300">{t("settings.note")}</p>
        <AdminForm
          endpoint={`/api/admin/devices/${deviceId}/settings`}
          method="PUT"
          submitLabel={t("common.save")}
          fields={[
            { name: "temp_warning_c", label: t("settings.warning"), type: "number", step: "0.1", required: true, defaultValue: String(cur.settings.temp_warning_c) },
            { name: "temp_danger_c", label: t("settings.danger"), type: "number", step: "0.1", required: true, defaultValue: String(cur.settings.temp_danger_c) },
          ]}
        />
      </Card>
      <Card title={t("settings.history")}>
        <Table head={["v", t("settings.warning"), t("settings.danger"), t("settings.changedBy"), t("common.time"), t("common.status")]}>
          {hist.map((h) => (
            <tr key={h.version}>
              <td className="px-3 py-2 font-mono text-white">{h.version}</td>
              <td className="px-3 py-2 text-ink-100">{h.settings.temp_warning_c} °C</td>
              <td className="px-3 py-2 text-ink-100">{h.settings.temp_danger_c} °C</td>
              <td className="px-3 py-2 text-ink-300">{h.created_by_name ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink-300">{new Date(h.created_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
              <td className="px-3 py-2">
                <Badge t={stateTone[h.command_status ?? "pending"]}>{t(`settings.state.${h.command_status ?? "pending"}` as "settings.state.pending")}</Badge>
                {h.completed_at && <span className="ml-2 text-xs text-ink-400">{new Date(h.completed_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })}</span>}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

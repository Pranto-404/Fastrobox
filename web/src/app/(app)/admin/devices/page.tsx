import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { isDemoMode } from "@/lib/env";
import { AdminForm, RowAction } from "@/components/AdminForm";
import { Badge, Card, PageTitle, SimBadge, Table } from "@/components/ui";

export const metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const devices = await db()<{ id: string; device_uid: string; name: string; room_id: string | null; is_simulated: boolean; firmware_version: string | null; online: boolean; last_seen_at: Date | null; online_threshold_s: number; token_prefix: string | null }[]>`
    select d.id, d.device_uid, d.name, d.room_id, d.is_simulated, d.firmware_version, d.last_seen_at, d.online_threshold_s,
           coalesce(d.last_seen_at > now() - make_interval(secs => d.online_threshold_s), false) as online,
           (select token_prefix from device_credentials c where c.device_id = d.id and c.revoked_at is null order by created_at desc limit 1) as token_prefix
      from devices d order by d.device_uid`;
  const fields = [
    { name: "device_uid", label: t("admin.deviceUid"), required: true, placeholder: "T07-D1" },
    { name: "name", label: t("common.name"), required: true },
    { name: "online_threshold_s", label: t("devices.threshold"), type: "number" as const, defaultValue: "15" },
    ...(isDemoMode() ? [{ name: "is_simulated", label: t("devices.simulated"), type: "checkbox" as const }] : []),
  ];
  return (
    <>
      <PageTitle>{t("nav.devices")}</PageTitle>
      <Card title={t("admin.registerDevice")}>
        <AdminForm endpoint="/api/admin/devices" submitLabel={t("common.add")} fields={fields} tokenLabel={t("admin.tokenOnce")} />
      </Card>
      <Table head={[t("common.device"), t("devices.room"), t("conn.online"), t("health.fw"), t("health.lastSeen"), "Token", t("common.actions")]}>
        {devices.map((d) => (
          <tr key={d.id}>
            <td className="px-3 py-2">
              <div className="font-mono text-white">{d.device_uid}</div>
              <div className="text-xs text-ink-400">{d.name} {d.is_simulated && <SimBadge label={t("common.simulated")} />}</div>
            </td>
            <td className="px-3 py-2 font-mono text-ink-300">{d.room_id ?? "—"}</td>
            <td className="px-3 py-2"><Badge t={d.online ? "accent" : "offline"}>{d.online ? t("conn.online") : t("conn.offline")}</Badge></td>
            <td className="px-3 py-2 font-mono text-xs text-ink-300">{d.firmware_version ?? "—"}</td>
            <td className="px-3 py-2 text-xs text-ink-300">{d.last_seen_at?.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }) ?? t("common.never")}</td>
            <td className="px-3 py-2 font-mono text-xs text-ink-400">{d.token_prefix ? `${d.token_prefix}…` : "—"}</td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                <RowAction endpoint={`/api/admin/devices/${d.id}`} body={{ action: "rotate_token" }} label={t("admin.rotateToken")} tokenLabel={t("admin.tokenOnce")} confirm="Revoke the current token and issue a new one?" />
                <Link href={`/admin/settings/${d.id}`} className="rounded-lg border border-ink-600 px-2.5 py-1 text-xs text-ink-100 hover:border-cyan-500/60">{t("nav.settings")}</Link>
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

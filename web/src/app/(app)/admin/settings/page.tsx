import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "Device settings" };
export const dynamic = "force-dynamic";

export default async function SettingsIndex() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const devices = await db()<{ id: string; device_uid: string; room_id: string | null }[]>`select id, device_uid, room_id from devices order by device_uid`;
  return (
    <>
      <PageTitle>{t("settings.title")}</PageTitle>
      <Card title={t("settings.selectDevice")}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/settings/${d.id}`} className="block rounded-lg border border-ink-700 px-4 py-3 hover:border-cyan-500/60">
                <div className="font-mono text-white">{d.device_uid}</div>
                <div className="text-xs text-ink-400">{d.room_id ?? "—"}</div>
              </Link>
            </li>
          ))}
          {!devices.length && <li className="text-ink-400">{t("common.noData")}</li>}
        </ul>
      </Card>
    </>
  );
}

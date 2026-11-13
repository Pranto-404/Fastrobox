import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { Badge, PageTitle, Table } from "@/components/ui";

export const metadata = { title: "Login history" };
export const dynamic = "force-dynamic";

export default async function LoginHistoryPage() {
  const user = await requirePageUser(["admin"]);
  const { t } = await getT(user.preferred_locale);
  const rows = await db()<{ id: number; created_at: Date; username: string; success: boolean; reason: string; ip: string | null }[]>`
    select id, created_at, username, success, reason, ip from login_attempts order by created_at desc limit 300`;
  return (
    <>
      <PageTitle>{t("admin.loginHistory")}</PageTitle>
      <Table head={[t("common.time"), t("common.user"), t("common.result"), t("common.reason"), "IP"]}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-ink-300">{r.created_at.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
            <td className="px-3 py-2 text-white">{r.username}</td>
            <td className="px-3 py-2"><Badge t={r.success ? "safe" : "fire"}>{r.success ? t("common.success") : t("common.failure")}</Badge></td>
            <td className="px-3 py-2 text-ink-300">{r.reason}</td>
            <td className="px-3 py-2 font-mono text-xs text-ink-400">{r.ip ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

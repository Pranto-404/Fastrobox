import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { AdminForm, RowAction } from "@/components/AdminForm";
import { Badge, Card, PageTitle, Table } from "@/components/ui";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requirePageUser(["admin"]);
  const { t } = await getT(me.preferred_locale);
  const users = await db()<{ id: string; username: string; display_name: string; role: string; is_active: boolean; telegram_chat_id: string | null; locked: boolean }[]>`
    select id, username, display_name, role, is_active, telegram_chat_id, coalesce(locked_until > now(), false) as locked
      from users order by role, username`;
  const roles = (["admin", "teacher", "student", "guardian"] as const).map((r) => ({ value: r, label: t(`role.${r}`) }));
  return (
    <>
      <PageTitle>{t("nav.users")}</PageTitle>
      <Card title={t("admin.createUser")}>
        <AdminForm
          endpoint="/api/admin/users"
          submitLabel={t("common.add")}
          fields={[
            { name: "username", label: t("login.username"), required: true },
            { name: "display_name", label: t("admin.displayName"), required: true },
            { name: "role", label: t("common.role"), type: "select", options: roles, required: true },
            { name: "password", label: t("login.password"), type: "password", required: true },
            { name: "telegram_chat_id", label: t("admin.telegram") },
          ]}
        />
      </Card>
      <Table head={[t("login.username"), t("common.name"), t("common.role"), t("admin.telegram"), t("common.status"), t("common.actions")]}>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2 font-mono text-white">{u.username}</td>
            <td className="px-3 py-2 text-ink-100">{u.display_name}</td>
            <td className="px-3 py-2"><Badge>{t(`role.${u.role}` as "role.admin")}</Badge></td>
            <td className="px-3 py-2 font-mono text-xs text-ink-300">{u.telegram_chat_id ?? "—"}</td>
            <td className="px-3 py-2">
              <Badge t={u.is_active ? "safe" : "offline"}>{u.is_active ? t("admin.active") : t("admin.disable")}</Badge>
              {u.locked && <Badge t="fire" className="ml-1">{t("admin.lockedUntil")}</Badge>}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-2">
                {u.id !== me.id && (
                  <RowAction endpoint={`/api/admin/users/${u.id}`} body={{ is_active: !u.is_active }} label={u.is_active ? t("admin.disable") : t("admin.enable")} />
                )}
                {u.locked && <RowAction endpoint={`/api/admin/users/${u.id}`} body={{ unlock: true }} label={t("admin.unlock")} />}
              </div>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}

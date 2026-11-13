import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { PageTitle } from "@/components/ui";
import { AlertsView } from "./AlertsView";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const user = await requirePageUser(["admin", "teacher"]);
  const { t } = await getT(user.preferred_locale);
  return (
    <>
      <PageTitle>{t("alerts.title")}</PageTitle>
      <AlertsView />
    </>
  );
}

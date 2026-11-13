import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { PageTitle } from "@/components/ui";
import { RoomsGrid } from "@/components/RoomLive";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const user = await requirePageUser(["admin", "teacher"]);
  const { t } = await getT(user.preferred_locale);
  return (
    <>
      <PageTitle sub={t("app.tagline")}>{t("nav.overview")}</PageTitle>
      <RoomsGrid />
    </>
  );
}

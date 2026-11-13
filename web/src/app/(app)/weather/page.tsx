import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { PageTitle } from "@/components/ui";
import { WeatherFull } from "@/components/Weather";

export const metadata = { title: "Weather" };

export default async function WeatherPage() {
  const user = await requirePageUser();
  const { t } = await getT(user.preferred_locale);
  return (
    <>
      <PageTitle>{t("weather.title")}</PageTitle>
      <WeatherFull isAdmin={user.role === "admin"} />
    </>
  );
}

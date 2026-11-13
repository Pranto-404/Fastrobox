import { requirePageUser } from "@/lib/auth/guard";
import { listRooms } from "@/lib/dashboard";
import { getT } from "@/lib/i18n";
import { PageTitle } from "@/components/ui";
import { View } from "./View";

export const metadata = { title: "Daily report" };

/** Teacher (own rooms) and Admin only; Students and Guardians get HTTP 403. */
export default async function Page() {
  const user = await requirePageUser(["admin", "teacher"]);
  const { t } = await getT(user.preferred_locale);
  const rooms = await listRooms(user);
  return (
    <>
      <PageTitle>{t("report.title")}</PageTitle>
      <View rooms={rooms.map((r) => ({ id: r.id, room_code: r.room_code }))} />
    </>
  );
}

import { forbidden, notFound } from "next/navigation";
import { z } from "zod";
import { requirePageUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";
import { RoomLiveView } from "@/components/RoomLive";

export const metadata = { title: "Room" };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser(["admin", "teacher"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    await assertRoomAccess(user, id);
  } catch {
    forbidden();
  }
  return <RoomLiveView id={id} canReset />;
}

import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private snapshots: Teacher (own rooms) and Admin only; never cached by browsers or proxies. */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireApiUser(["admin", "teacher"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  const [s] = await db()<{ classroom_id: string | null; mime: string; image: Buffer }[]>`
    select classroom_id, mime, image from private_snapshots where id = ${id}`;
  if (!s) throw new ApiError(404, "not_found", "Not found");
  if (s.classroom_id) await assertRoomAccess(user, s.classroom_id);
  else if (user.role !== "admin") throw new ApiError(403, "forbidden", "Not allowed");
  return new Response(new Uint8Array(s.image), {
    headers: { "content-type": s.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
});

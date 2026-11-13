import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertRoomAccess } from "@/lib/access";
import { ask } from "@/lib/assistant";

export const runtime = "nodejs";

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const user = await requireApiUser(["admin", "teacher"]);
  const b = z.strictObject({ room: z.uuid(), question: z.string().trim().min(2).max(300) }).parse(await readJson(req, 2048));
  await assertRoomAccess(user, b.room);
  return NextResponse.json(await ask(b.question, b.room));
});

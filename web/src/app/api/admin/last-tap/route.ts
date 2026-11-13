import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { uidFromDetail } from "@/lib/device/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Register card": the Admin taps the card on the device; this returns that tap's UID. */
export const GET = route(async () => {
  await requireApiUser(["admin"]);
  const [e] = await db()<{ detail: string; recorded_at: Date; device_uid: string }[]>`
    select e.detail, e.recorded_at, d.device_uid from device_events e join devices d on d.id = e.device_id
     where e.event_type = 'CARD_TAP' and e.received_at > now() - interval '60 seconds'
     order by e.received_at desc limit 1`;
  return NextResponse.json(e ? { uid: uidFromDetail(e.detail), at: e.recorded_at, device: e.device_uid } : { uid: null });
});

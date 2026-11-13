import { db } from "../db";
import { currentSettings } from "../settings";
import { runningClass } from "../attendance";
import type { DeviceContext } from "./auth";

export async function devicePollState(dev: DeviceContext) {
  const sql = db();
  const settings = await currentSettings(dev.id);
  const [d] = await sql<{ camera_position: string; night_mode: boolean }[]>`
    select camera_position, night_mode from devices where id = ${dev.id}`;
  const teacherTags = await sql<{ uid: string }[]>`
    select uid from rfid_cards where kind = 'teacher_tag' and status = 'active' order by uid`;
  let offlineCards: string[] = [];
  let classNow: { subject: string } | null = null;
  if (dev.classroom_id) {
    const cls = await runningClass(sql, dev.classroom_id, new Date());
    if (cls) {
      classNow = { subject: cls.subject };
      offlineCards = (
        await sql<{ uid: string }[]>`
          select c.uid from rfid_cards c join students s on s.id = c.student_id
           where c.kind = 'student' and c.status = 'active' and s.classroom_id = ${dev.classroom_id}
             and (c.blocked_until is null or c.blocked_until < now())
           order by c.uid`
      ).map((r) => r.uid);
    }
  }
  const [notice] = await sql<{ id: number; level: string; message: string }[]>`
    select id, level, message from weather_alerts
     where removed_at is null and level = 'DANGER' and valid_from <= now() and (valid_to is null or valid_to > now())
     order by created_at desc limit 1`;
  const [wx] = await sql<{ payload: { line?: string }; fetched_at: Date }[]>`
    select payload, fetched_at from weather_cache order by fetched_at desc limit 1`;
  return {
    settings: { version: settings.version, ...settings.settings },
    weather: {
      line: wx?.payload?.line ?? null,
      fetched_at: wx ? Math.floor(wx.fetched_at.getTime() / 1000) : null,
      danger_notice: notice ? { id: notice.id, text: notice.message } : null,
    },
    teacher_tags: teacherTags.map((t) => t.uid),
    class_now: classNow,
    offline_cards: offlineCards,
    camera: { position: d.camera_position, night_mode: d.night_mode },
  };
}

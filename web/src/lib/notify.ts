import { db } from "./db";
import { config } from "./env";
import { PHONE_ALERT_TYPES, type CreatedAlert } from "./alerts";

/**
 * Delivers alert notifications. Channel: Telegram Bot API (if TELEGRAM_BOT_TOKEN is
 * set) to admins and to teachers assigned to the alert's classroom who have linked a
 * chat id. Every attempt is recorded in notification_deliveries. Failures never
 * block ingestion.
 */
export async function notifyAlerts(alerts: CreatedAlert[]) {
  for (const a of alerts) {
    try {
      await notifyOne(a);
    } catch (e) {
      console.error("[notify] failed", e);
    }
  }
}

async function notifyOne(a: CreatedAlert) {
  if (!PHONE_ALERT_TYPES.includes(a.type)) return;
  const recipients = await db()<{ id: string; telegram_chat_id: string | null; username: string }[]>`
    select distinct u.id, u.telegram_chat_id, u.username from users u
     where u.is_active and (u.role = 'admin'
        or (u.role = 'teacher' and exists (
              select 1 from teacher_classrooms tc where tc.teacher_id = u.id and tc.classroom_id = ${a.classroomId})))`;
  const token = config().TELEGRAM_BOT_TOKEN;
  const prefix = a.isSimulated ? "[SIMULATED DATA] " : "";
  const text = `${prefix}FastRobox ${a.severity.toUpperCase()}: ${a.title}\n${a.message}`;
  for (const r of recipients) {
    if (!r.telegram_chat_id) continue;
    if (!token) {
      await record(a.id, "telegram", r.username, "not_configured", "TELEGRAM_BOT_TOKEN not set");
      continue;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: r.telegram_chat_id, text }),
        signal: AbortSignal.timeout(4000),
      });
      await record(a.id, "telegram", r.username, res.ok ? "sent" : "failed", res.ok ? null : `HTTP ${res.status}`);
    } catch (e) {
      await record(a.id, "telegram", r.username, "failed", (e as Error).message.slice(0, 200));
    }
  }
}

async function record(alertId: number, channel: string, recipient: string, status: string, error: string | null) {
  await db()`insert into notification_deliveries (alert_id, channel, recipient, status, error)
             values (${alertId}, ${channel}, ${recipient}, ${status}, ${error})`;
}

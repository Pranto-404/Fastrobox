import { db, type Tx } from "./db";


export async function audit(
  actorUserId: string | null,
  action: string,
  target: { type?: string; id?: string | number } = {},
  details: Record<string, unknown> = {},
  ip: string | null = null,
  tx: Tx = db(),
) {
  await tx`
    insert into audit_logs (actor_user_id, action, target_type, target_id, details, ip)
    values (${actorUserId}, ${action}, ${target.type ?? null}, ${target.id != null ? String(target.id) : null},
            ${tx.json(details as never)}, ${ip})`;
}

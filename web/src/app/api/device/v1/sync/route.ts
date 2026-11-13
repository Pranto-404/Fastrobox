import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route, readJson } from "@/lib/http";
import { assertBodyDevice, authenticateDevice } from "@/lib/device/auth";
import { syncSchema } from "@/lib/device/schemas";
import { ingestEvent, ingestTelemetry, ReplayError } from "@/lib/device/ingest";
import { notifyAlerts } from "@/lib/notify";
import type { CreatedAlert } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Offline buffer upload (Level 12), oldest first. Each item is stored at most once
 * (a replayed seq is reported "duplicate" and skipped) and keeps its original ts.
 * `remaining` drives the SYNCING → LIVE state shown on the dashboard.
 */
export const POST = route(async (req) => {
  const dev = await authenticateDevice(req);
  const body = syncSchema.parse(await readJson(req, 512 * 1024));
  assertBodyDevice(dev, body.device_id);
  for (const it of body.items) assertBodyDevice(dev, it.body.device_id);

  const alerts: CreatedAlert[] = [];
  const results: { seq: number; kind: string; status: "stored" | "duplicate" }[] = [];
  await db().begin(async (tx) => {
    for (const it of body.items) {
      const opts = { replay: true, tx, alerts };
      try {
        await tx.savepoint(async (sp) => {
          if (it.kind === "telemetry") await ingestTelemetry(dev, it.body, { ...opts, tx: sp });
          else await ingestEvent(dev, it.body, { ...opts, tx: sp });
        });
        results.push({ seq: it.body.seq, kind: it.kind, status: "stored" });
      } catch (e) {
        if (!(e instanceof ReplayError)) throw e;
        results.push({ seq: it.body.seq, kind: it.kind, status: "duplicate" });
      }
    }
    await tx`update devices set sync_pending = ${body.remaining}, last_sync_at = now() where id = ${dev.id}`;
  });
  if (alerts.length) await notifyAlerts(alerts);
  const stored = results.filter((r) => r.status === "stored").length;
  return NextResponse.json({
    ok: true, received: results.length, stored, duplicates: results.length - stored, results,
    server_time: Math.floor(Date.now() / 1000),
  });
});

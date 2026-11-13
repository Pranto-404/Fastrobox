import { sweepDeviceHealth } from "./device/ingest";
import { finalizeAbsences } from "./attendance";

const g = globalThis as unknown as { __frxLastSweep?: number; __frxSweeping?: Promise<void> };

/**
 * Periodic work without a long-running worker: device offline detection and
 * Absent marking. Called (throttled) by device polls and dashboard polls, and by
 * the /api/cron/tick route for an external scheduler.
 */
export async function runSweeps(minIntervalMs = 3000): Promise<void> {
  const now = Date.now();
  if (g.__frxSweeping) return g.__frxSweeping;
  if (g.__frxLastSweep && now - g.__frxLastSweep < minIntervalMs) return;
  g.__frxLastSweep = now;
  g.__frxSweeping = (async () => {
    try {
      await sweepDeviceHealth();
      await finalizeAbsences();
    } catch (e) {
      console.error("[sweeps] failed", e);
    } finally {
      g.__frxSweeping = undefined;
    }
  })();
  return g.__frxSweeping;
}

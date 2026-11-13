import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { authenticateDevice } from "@/lib/device/auth";
import { pollCommands } from "@/lib/device/commands";
import { devicePollState } from "@/lib/device/poll";
import { runSweeps } from "@/lib/sweeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The device polls this every 2 s. One response carries everything the device must
 * act on within the paper's time limits: commands (settings ≤ 10 s, Reset fire,
 * OTA), the current limits, the active weather Danger notice, the Teacher tag list,
 * the card UIDs of the class running now (offline entry), camera position and
 * Night mode.
 */
export const GET = route(async (req) => {
  const dev = await authenticateDevice(req);
  void runSweeps();
  const [commands, state] = await Promise.all([pollCommands(dev), devicePollState(dev)]);
  return NextResponse.json({
    ok: true,
    commands: commands.map((c) => ({ id: c.id, type: c.command_type, payload: c.payload })),
    ...state,
    server_time: Math.floor(Date.now() / 1000),
  });
});

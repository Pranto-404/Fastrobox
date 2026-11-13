import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Unauthenticated server clock for devices without NTP (no data exposed). */
export function GET() {
  const now = Date.now();
  return NextResponse.json({ epoch_ms: now, iso: new Date(now).toISOString() });
}

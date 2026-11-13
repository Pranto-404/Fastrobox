import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { activeBanners } from "@/lib/dashboard";
import { runSweeps } from "@/lib/sweeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** FIRE / PANIC / weather-Danger banners for every logged-in role (room codes only). */
export const GET = route(async () => {
  await requireApiUser();
  void runSweeps();
  return NextResponse.json(await activeBanners());
});

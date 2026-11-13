import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { refreshWeather, weatherView } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current weather, 24 h forecast and notices for every logged-in role. Server-side fetch only. */
export const GET = route(async () => {
  await requireApiUser();
  await refreshWeather();
  return NextResponse.json(await weatherView());
});

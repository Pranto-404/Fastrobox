import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const u = await requireApiUser();
  return NextResponse.json({ id: u.id, username: u.username, display_name: u.display_name, role: u.role, locale: u.preferred_locale });
});

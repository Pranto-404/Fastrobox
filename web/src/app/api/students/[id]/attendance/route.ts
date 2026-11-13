import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/http";
import { requireApiUser } from "@/lib/auth/guard";
import { assertStudentAccess } from "@/lib/access";
import { studentAttendance } from "@/lib/attendanceQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "not_found", "Not found");
  await assertStudentAccess(user, id); // 403 with no data for other students / other children
  return NextResponse.json({ attendance: await studentAttendance(id) });
});

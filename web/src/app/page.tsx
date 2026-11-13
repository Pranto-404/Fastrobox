import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { homeFor } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  redirect(u ? homeFor(u.role) : "/login");
}

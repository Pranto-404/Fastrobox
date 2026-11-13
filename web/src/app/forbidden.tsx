import Link from "next/link";
import { ShieldX } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n";
import { homeFor } from "@/components/nav";

/** Rendered with HTTP 403 by forbidden(). Shows no data from the refused page. */
export default async function Forbidden() {
  const u = await currentUser();
  const { t } = await getT(u?.preferred_locale);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <ShieldX className="mx-auto mb-4 size-12 text-red-400" aria-hidden />
        <h1 className="text-2xl font-semibold text-white">403 · {t("forbidden.title")}</h1>
        <p className="mt-2 text-ink-300">{t("forbidden.body")}</p>
        <Link href={u ? homeFor(u.role) : "/login"} className="mt-6 inline-block rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white">
          {t("forbidden.back")}
        </Link>
      </div>
    </main>
  );
}

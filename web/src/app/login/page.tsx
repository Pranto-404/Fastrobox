import { redirect } from "next/navigation";
import { Cpu } from "lucide-react";
import { currentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n-client";
import { LangSwitch } from "@/components/LangSwitch";
import { homeFor } from "@/components/nav";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  const { t, locale } = await getT();
  return (
    <I18nProvider locale={locale}>
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-xl shadow-cyan-900/40">
              <Cpu className="size-7 text-white" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold text-white">{t("app.name")}</h1>
            <p className="mt-1 text-sm text-ink-300">{t("app.tagline")}</p>
          </div>
          <div className="rounded-2xl border border-ink-700/70 bg-ink-900/80 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-medium text-white">{t("login.title")}</h2>
            <LoginForm />
          </div>
          <div className="mt-4 flex justify-center">
            <LangSwitch />
          </div>
        </div>
      </main>
    </I18nProvider>
  );
}

import { Cpu } from "lucide-react";
import { requirePageUser } from "@/lib/auth/guard";
import { getT } from "@/lib/i18n";
import { isDemoMode } from "@/lib/env";
import { I18nProvider } from "@/components/i18n-client";
import { Sidebar } from "@/components/Sidebar";
import { LiveBanner } from "@/components/LiveBanner";
import { WeatherStrip } from "@/components/Weather";
import { LangSwitch, LogoutButton } from "@/components/LangSwitch";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const { t, locale } = await getT(user.preferred_locale);
  const demo = isDemoMode();
  return (
    <I18nProvider locale={locale}>
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-ink-800 bg-ink-900/60 p-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="mb-4 flex items-center gap-2.5 lg:mb-8">
            <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-900/40">
              <Cpu className="size-5 text-white" aria-hidden />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">FastRobox</div>
              <div className="text-[11px] text-ink-400">Smart Classroom</div>
            </div>
          </div>
          <Sidebar role={user.role} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-white">{user.display_name}</span>
              <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs text-ink-300">{t(`role.${user.role}`)}</span>
              {demo && <span className="rounded-md bg-fuchsia-500/20 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-200">{t("mode.demo")}</span>}
            </div>
            <div className="flex items-center gap-2">
              <LangSwitch />
              <LogoutButton label={t("nav.logout")} />
            </div>
          </header>
          <main className="flex-1 space-y-6 px-4 py-6 sm:px-6">
            <LiveBanner />
            <WeatherStrip />
            {children}
          </main>
        </div>
      </div>
    </I18nProvider>
  );
}

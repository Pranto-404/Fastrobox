"use client";
import { Flame, Siren, CloudLightning } from "lucide-react";
import { useLive } from "./live";
import { useT } from "./i18n-client";
import { SimBadge } from "./ui";

interface Banners {
  alerts: { id: number; type: "FIRE" | "PANIC"; room: string; at: string; simulated: boolean }[];
  weather: { id: number; text: string; origin: string }[];
}

/** Red FIRE / PANIC and weather-Danger banners on every logged-in page. */
export function LiveBanner() {
  const { t } = useT();
  const { data } = useLive<Banners>("/api/live/banner", 1500);
  if (!data || (!data.alerts.length && !data.weather.length)) return null;
  return (
    <div role="alert" aria-live="assertive" className="space-y-2">
      {data.alerts.map((a) => (
        <div key={a.id} className="frx-flash flex items-center gap-3 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-red-900/40">
          {a.type === "FIRE" ? <Flame className="size-5 shrink-0" aria-hidden /> : <Siren className="size-5 shrink-0" aria-hidden />}
          <span className="text-base sm:text-lg">{a.type === "FIRE" ? t("banner.fire", { room: a.room }) : t("banner.panic", { room: a.room })}</span>
          <span className="ml-auto text-xs font-normal opacity-90">{new Date(a.at).toLocaleTimeString()}</span>
          {a.simulated && <SimBadge label={t("common.simulated")} />}
        </div>
      ))}
      {data.weather.map((w) => (
        <div key={`w${w.id}`} className="flex items-center gap-3 rounded-xl bg-red-700 px-4 py-3 font-semibold text-white">
          <CloudLightning className="size-5 shrink-0" aria-hidden />
          <span>{t("banner.weather", { text: w.text })}</span>
          <span className="ml-auto text-xs uppercase opacity-80">{w.origin}</span>
        </div>
      ))}
    </div>
  );
}

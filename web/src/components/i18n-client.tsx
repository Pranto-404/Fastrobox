"use client";
import { createContext, useCallback, useContext } from "react";
import { translate, type DictKey, type Locale } from "@/lib/i18n/dict";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useT() {
  const locale = useContext(Ctx);
  const t = useCallback((key: DictKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  return { t, locale };
}

/** Relative "x s ago" label, localised. */
export function useAgo() {
  const { t } = useT();
  return (iso: string | null | undefined, now = Date.now()) => {
    if (!iso) return t("common.never");
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return s < 120 ? t("common.secondsAgo", { s }) : t("common.minutesAgo", { m: Math.round(s / 60) });
  };
}

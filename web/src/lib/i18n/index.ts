import { cookies } from "next/headers";
import { translate, type DictKey, type Locale } from "./dict";

export const LOCALE_COOKIE = "frx_lang";

export async function getLocale(fallback?: Locale): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (v === "en" || v === "bn") return v;
  return fallback ?? "en";
}

export async function getT(fallback?: Locale) {
  const locale = await getLocale(fallback);
  return { locale, t: (key: DictKey, vars?: Record<string, string | number>) => translate(locale, key, vars) };
}

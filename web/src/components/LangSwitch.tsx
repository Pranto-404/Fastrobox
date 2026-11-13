"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { useT } from "./i18n-client";

export function LangSwitch() {
  const { t, locale } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "en" ? "bn" : "en";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/me/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: next }) });
          router.refresh();
        })
      }
      className="inline-flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-ink-100 hover:border-cyan-500/60"
      aria-label={next === "bn" ? "Switch to Bangla" : "ইংরেজিতে পরিবর্তন করুন"}
    >
      <Languages className="size-4" aria-hidden />
      {t("nav.language")}
    </button>
  );
}

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-lg px-3 py-1.5 text-sm text-ink-300 hover:bg-ink-800 hover:text-white"
    >
      {label}
    </button>
  );
}

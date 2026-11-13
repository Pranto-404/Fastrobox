"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/i18n-client";
import { Button, inputCls } from "@/components/ui";

export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => null);
      if (res.status === 423) setError(t("login.locked", { s: j?.error?.details?.retry_after_s ?? 30 }));
      else if (res.status === 401) setError(t("login.invalid"));
      else setError(t("login.error"));
    } catch {
      setError(t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="username" className="mb-1 block text-sm text-ink-300">{t("login.username")}</label>
        <input id="username" name="username" autoComplete="username" required className={inputCls} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm text-ink-300">{t("login.password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputCls} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/40">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("common.loading") : t("login.submit")}
      </Button>
    </form>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import * as Icons from "lucide-react";
import { NAV } from "./nav";
import { useT } from "./i18n-client";
import type { Role } from "@/lib/auth/session";

export function Sidebar({ role }: { role: Role }) {
  const { t } = useT();
  const path = usePathname();
  const items = NAV.filter((n) => n.roles.includes(role));
  const main = items.filter((i) => !i.group);
  const admin = items.filter((i) => i.group === "admin");
  const link = (n: (typeof items)[number]) => {
    const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[n.icon] ?? Icons.Circle;
    const active = path === n.href || path.startsWith(n.href + "/");
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={clsx(
          "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
          active ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30" : "text-ink-300 hover:bg-ink-800 hover:text-white",
        )}
      >
        <Icon className="size-4" />
        {t(n.key)}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {main.map(link)}
      {admin.length > 0 && (
        <>
          <div className="hidden px-3 pt-5 pb-1 text-[11px] font-semibold tracking-widest text-ink-400 uppercase lg:block">{t("nav.admin")}</div>
          {admin.map(link)}
        </>
      )}
    </nav>
  );
}

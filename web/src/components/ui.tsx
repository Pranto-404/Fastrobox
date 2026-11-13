import clsx from "clsx";
import type { ReactNode } from "react";

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-2xl border border-ink-700/70 bg-ink-900/80 p-5 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6)] backdrop-blur", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold tracking-wide text-ink-300 uppercase">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-300">{sub}</p>}
    </div>
  );
}

const tone = {
  neutral: "bg-ink-700/60 text-ink-100 ring-ink-600",
  accent: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/40",
  safe: "bg-green-500/15 text-green-300 ring-green-500/40",
  warn: "bg-yellow-400/15 text-yellow-200 ring-yellow-400/40",
  danger: "bg-orange-500/15 text-orange-200 ring-orange-500/40",
  fire: "bg-red-500/20 text-red-200 ring-red-500/50",
  panic: "bg-purple-500/20 text-purple-200 ring-purple-500/50",
  offline: "bg-slate-500/15 text-slate-300 ring-slate-500/40",
} as const;
export type Tone = keyof typeof tone;

export function Badge({ children, t = "neutral", className }: { children: ReactNode; t?: Tone; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", tone[t], className)}>
      {children}
    </span>
  );
}

export function SimBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-fuchsia-500/20 px-2 py-0.5 text-[11px] font-bold tracking-widest text-fuchsia-200 ring-1 ring-fuchsia-400/50">
      {label}
    </span>
  );
}

export function Stat({ label, value, unit, hint, t }: { label: ReactNode; value: ReactNode; unit?: string; hint?: ReactNode; t?: Tone }) {
  return (
    <div className="rounded-xl border border-ink-700/60 bg-ink-850/70 p-4">
      <div className="text-xs font-medium text-ink-400">{label}</div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums", t === "fire" ? "text-red-300" : t === "danger" ? "text-orange-300" : t === "warn" ? "text-yellow-200" : "text-white")}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-ink-300">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function Button({
  children, variant = "primary", className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...rest}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/30 hover:brightness-110",
        variant === "ghost" && "border border-ink-600 bg-ink-850 text-ink-100 hover:border-cyan-500/60 hover:text-white",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-500",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700/60">
      <table className="min-w-full divide-y divide-ink-700/60 text-sm">
        <thead className="bg-ink-850/80">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-ink-300 uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2 text-sm text-white placeholder:text-ink-400 focus:border-cyan-400 focus:outline-none";

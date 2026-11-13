"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, inputCls } from "./ui";

export interface Field {
  name: string;
  label: string;
  type?: "text" | "password" | "number" | "select" | "time" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  step?: string;
}

interface ApiErr {
  error?: { message?: string; details?: { path: string; message: string }[] | unknown };
}

function errorText(j: ApiErr | null, fallback: string) {
  const d = j?.error?.details;
  if (Array.isArray(d) && d.length) return d.map((x: { path: string; message: string }) => (x.path ? `${x.path}: ${x.message}` : x.message)).join(" · ");
  return j?.error?.message ?? fallback;
}

/** Posts the form as JSON (numbers converted), shows field errors from the API, refreshes the page. */
export function AdminForm({
  endpoint, method = "POST", fields, submitLabel, tokenLabel, className,
}: {
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT";
  fields: Field[];
  submitLabel: string;
  /** If the response contains a one-time `token`, reveal it with this label. */
  tokenLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = fd.get(f.name);
      if (f.type === "checkbox") body[f.name] = v === "on";
      else if (f.type === "number") { if (v !== "" && v !== null) body[f.name] = Number(v); }
      else if (v !== null && v !== "") body[f.name] = String(v);
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(errorText(j, `HTTP ${res.status}`));
        return;
      }
      if (tokenLabel && j?.token) setResult(<TokenReveal token={String(j.token)} label={tokenLabel} />);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={className ?? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
      {fields.map((f) => (
        <div key={f.name} className={f.type === "checkbox" ? "flex items-center gap-2 pt-6" : ""}>
          <label htmlFor={`${endpoint}-${f.name}`} className={f.type === "checkbox" ? "order-2 text-sm text-ink-300" : "mb-1 block text-xs text-ink-300"}>
            {f.label}
          </label>
          {f.type === "select" ? (
            <select id={`${endpoint}-${f.name}`} name={f.name} required={f.required} defaultValue={f.defaultValue ?? ""} className={inputCls}>
              {!f.required && <option value="">—</option>}
              {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              id={`${endpoint}-${f.name}`} name={f.name} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder}
              defaultValue={f.defaultValue} step={f.step} autoComplete={f.type === "password" ? "new-password" : "off"}
              className={f.type === "checkbox" ? "size-4 accent-cyan-500" : inputCls}
            />
          )}
        </div>
      ))}
      <div className="flex items-end gap-3 sm:col-span-full">
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
        {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      </div>
      {result && <div className="sm:col-span-full">{result}</div>}
    </form>
  );
}

/** One-click row action (PATCH/DELETE) with optional confirmation and result message. */
export function RowAction({
  endpoint, method = "PATCH", body, label, confirm, variant = "ghost", tokenLabel,
}: {
  endpoint: string;
  method?: "PATCH" | "DELETE" | "POST";
  body?: Record<string, unknown>;
  label: string;
  confirm?: string;
  variant?: "ghost" | "danger" | "primary";
  tokenLabel?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant={variant}
        className="px-2.5 py-1 text-xs"
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          const res = await fetch(endpoint, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
          const j = await res.json().catch(() => null);
          setBusy(false);
          if (!res.ok) setMsg(<span className="text-red-300">{errorText(j, `HTTP ${res.status}`)}</span>);
          else {
            setMsg(tokenLabel && j?.token ? <TokenReveal token={String(j.token)} label={tokenLabel} /> : null);
            router.refresh();
          }
        }}
      >
        {label}
      </Button>
      {msg && <span role="status" className="text-xs">{msg}</span>}
    </span>
  );
}

export function TokenReveal({ token, label }: { token: string; label: string }) {
  return (
    <div className="rounded-lg border border-yellow-400/40 bg-yellow-400/10 p-3 text-sm">
      <p className="mb-1 text-yellow-100">{label}</p>
      <code className="block break-all rounded bg-ink-950 p-2 font-mono text-xs text-cyan-200 select-all">{token}</code>
    </div>
  );
}

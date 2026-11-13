"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, inputCls } from "@/components/ui";

export function FirmwareUpload({ labels }: { labels: Record<string, string> }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const res = await fetch("/api/admin/firmware", { method: "POST", body: new FormData(e.currentTarget) });
      const j = await res.json().catch(() => null);
      setBusy(false);
      setMsg(res.ok ? `✓ ${j.version} · ${j.size} B · sha256 ${String(j.sha256).slice(0, 16)}… · ${j.check.ok ? "image OK" : `CHECK FAILED: ${j.check.reason}`}` : (j?.error?.message ?? `HTTP ${res.status}`));
      if (res.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); }
    }}>
      <div><label htmlFor="fw-v" className="mb-1 block text-xs text-ink-300">{labels.version}</label><input id="fw-v" name="version" required placeholder="1.0.1" className={inputCls} /></div>
      <div><label htmlFor="fw-f" className="mb-1 block text-xs text-ink-300">{labels.file}</label><input id="fw-f" name="file" type="file" accept=".bin,application/octet-stream" required className="text-sm text-ink-300" /></div>
      <div><label htmlFor="fw-n" className="mb-1 block text-xs text-ink-300">{labels.notes}</label><input id="fw-n" name="notes" className={inputCls} /></div>
      <div className="flex items-end"><Button type="submit" disabled={busy}>{labels.submit}</Button></div>
      {msg && <p role="status" className="text-sm text-cyan-200 sm:col-span-4">{msg}</p>}
    </form>
  );
}

export function DeployButton({ releaseId, devices, label }: { releaseId: string; devices: { id: string; label: string }[]; label: string }) {
  const router = useRouter();
  const [dev, setDev] = useState(devices[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="device" className={`${inputCls} w-auto py-1 text-xs`} value={dev} onChange={(e) => setDev(e.target.value)}>
        {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
      <Button variant="ghost" className="px-2.5 py-1 text-xs" disabled={!dev} onClick={async () => {
        const res = await fetch(`/api/admin/devices/${dev}/ota`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ release_id: releaseId }) });
        const j = await res.json().catch(() => null);
        setMsg(res.ok ? "✓ queued" : (j?.error?.message ?? `HTTP ${res.status}`));
        router.refresh();
      }}>{label}</Button>
      {msg && <span role="status" className="text-xs text-cyan-200">{msg}</span>}
    </div>
  );
}

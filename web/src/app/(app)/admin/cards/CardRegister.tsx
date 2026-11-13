"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, inputCls } from "@/components/ui";

type Opt = { id: string; label: string };

/** Register card: tap it on the device, pull the UID, choose the owner, save. */
export function CardRegister({ students, teachers, labels }: { students: Opt[]; teachers: Opt[]; labels: Record<string, string> }) {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [kind, setKind] = useState<"student" | "teacher_tag">("student");
  const [owner, setOwner] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label className="mb-1 block text-xs text-ink-300" htmlFor="card-uid">{labels.uid}</label>
        <div className="flex gap-2">
          <input id="card-uid" value={uid} onChange={(e) => setUid(e.target.value)} className={inputCls} placeholder="04A1B2C3" />
        </div>
        <button type="button" className="mt-1 text-xs text-cyan-300 hover:underline" onClick={async () => {
          const r = await fetch("/api/admin/last-tap");
          const j = await r.json();
          setMsg(j.uid ? `${j.device}: ${j.uid}` : "—");
          if (j.uid) setUid(j.uid);
        }}>{labels.useLast}</button>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-300" htmlFor="card-kind">{labels.kind}</label>
        <select id="card-kind" className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as "student"); setOwner(""); }}>
          <option value="student">{labels.student}</option>
          <option value="teacher_tag">{labels.tag}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-300" htmlFor="card-owner">{labels.owner}</label>
        <select id="card-owner" className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">—</option>
          {(kind === "student" ? students : teachers).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="flex items-end gap-2">
        <Button onClick={async () => {
          const body = kind === "student" ? { uid, kind, student_id: owner || null } : { uid, kind, user_id: owner || null };
          const r = await fetch("/api/admin/cards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => null);
          setMsg(r.ok ? "✓" : (j?.error?.details?.[0]?.message ?? j?.error?.message ?? "✗"));
          if (r.ok) { setUid(""); router.refresh(); }
        }}>{labels.save}</Button>
        {msg && <span role="status" className="text-xs text-cyan-200">{msg}</span>}
      </div>
    </div>
  );
}

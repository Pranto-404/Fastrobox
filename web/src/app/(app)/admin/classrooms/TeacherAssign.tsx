"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function TeacherAssign({ roomId, teachers, assigned, saveLabel }: { roomId: string; teachers: { id: string; display_name: string }[]; assigned: string[]; saveLabel: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(assigned);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {teachers.map((tc) => (
        <label key={tc.id} className="inline-flex items-center gap-1 text-xs text-ink-100">
          <input type="checkbox" className="accent-cyan-500" checked={sel.includes(tc.id)}
            onChange={(e) => setSel((s) => (e.target.checked ? [...s, tc.id] : s.filter((x) => x !== tc.id)))} />
          {tc.display_name}
        </label>
      ))}
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={async () => {
        const res = await fetch(`/api/admin/classrooms/${roomId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ teacher_ids: sel }) });
        setMsg(res.ok ? "✓" : "✗");
        router.refresh();
      }}>{saveLabel}</Button>
      {msg && <span className="text-xs text-cyan-200">{msg}</span>}
    </div>
  );
}

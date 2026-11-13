"use client";
import { useState } from "react";
import { Bot, Send } from "lucide-react";
import type { AssistantAnswer } from "@/lib/assistant";
import { useT } from "@/components/i18n-client";
import { fetchJson } from "@/components/live";
import { RoomPicker } from "@/components/RoomPicker";
import { Button, Card, inputCls } from "@/components/ui";

export function View({ rooms }: { rooms: { id: string; room_code: string }[] }) {
  const { t } = useT();
  const [room, setRoom] = useState(rooms[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: AssistantAnswer | null; err?: string }[]>([]);
  if (!rooms.length) return <Card><p className="text-ink-300">{t("common.noData")}</p></Card>;
  return (
    <Card>
      <p className="mb-4 text-sm text-ink-300">{t("assistant.hint")}</p>
      <div className="mb-4 max-w-xs"><RoomPicker rooms={rooms} value={room} onChange={setRoom} label={t("common.room")} /></div>
      <ul className="mb-4 space-y-4" aria-live="polite">
        {log.map((m, i) => (
          <li key={i} className="space-y-2">
            <div className="ml-auto max-w-xl rounded-xl bg-cyan-600/20 px-4 py-2 text-white">{m.q}</div>
            <div className="flex max-w-2xl gap-3 rounded-xl bg-ink-850 px-4 py-3">
              <Bot className="mt-0.5 size-5 shrink-0 text-cyan-300" aria-hidden />
              <div className="space-y-1">
                <p className={m.a?.no_data ? "text-yellow-200" : "text-ink-100"}>{m.a?.answer ?? m.err}</p>
                {m.a?.time_range && <p className="text-xs text-ink-400">{t("assistant.range")}: {m.a.time_range.from} → {m.a.time_range.to} ({m.a.time_range.timezone})</p>}
                {m.a && m.a.sources.length > 0 && <p className="text-xs text-ink-400">{t("assistant.sources")}: {m.a.sources.join(" · ")}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!q.trim()) return;
        setBusy(true);
        const question = q;
        setQ("");
        try {
          const a = await fetchJson<AssistantAnswer>("/api/assistant", { method: "POST", body: JSON.stringify({ room, question }) });
          setLog((l) => [...l, { q: question, a }]);
        } catch {
          setLog((l) => [...l, { q: question, a: null, err: t("common.error") }]);
        } finally {
          setBusy(false);
        }
      }}>
        <label htmlFor="aq" className="sr-only">{t("assistant.placeholder")}</label>
        <input id="aq" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("assistant.placeholder")} className={inputCls} maxLength={300} />
        <Button type="submit" disabled={busy}><Send className="size-4" />{t("assistant.ask")}</Button>
      </form>
    </Card>
  );
}

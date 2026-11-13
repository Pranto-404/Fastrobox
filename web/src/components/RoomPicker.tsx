"use client";
import { inputCls } from "./ui";

export function RoomPicker({ rooms, value, onChange, label }: { rooms: { id: string; room_code: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <label htmlFor="room-pick" className="mb-1 block text-xs text-ink-300">{label}</label>
      <select id="room-pick" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {rooms.map((r) => <option key={r.id} value={r.id}>{r.room_code}</option>)}
      </select>
    </div>
  );
}

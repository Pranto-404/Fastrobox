import { db } from "@/lib/db";
import { registerDevice } from "@/lib/devices";

export async function resetDb() {
  const tables = await db()<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
  await db().unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
}

export async function makeDevice(opts: { uid?: string; simulated?: boolean; threshold?: number } = {}) {
  return registerDevice(
    { device_uid: opts.uid ?? "T07-D1", name: "Test device", is_simulated: opts.simulated ?? true, online_threshold_s: opts.threshold ?? 15 },
    null,
  );
}

export function deviceReq(path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const nowS = () => Math.floor(Date.now() / 1000);

/** A telemetry record in the question paper's fixed format. */
export function telemetry(seq: number, over: Record<string, unknown> = {}) {
  return {
    device_id: "T07-D1", room_id: "R-305", seq, ts: nowS(), uptime_s: 742, temp_c: 29.0, rh: 64, heat_index_c: 31.2,
    flame: false, door: "LOCKED", status: "SAFE", heat_trend: "STABLE", rssi: -61, heap_kb: 182, chip_temp_c: 41.5,
    fw: "1.0.0", quality: "good", ...over,
  };
}

export function event(seq: number, type: string, detail = "", over: Record<string, unknown> = {}) {
  return { device_id: "T07-D1", room_id: "R-305", seq, ts: nowS(), type, detail, ...over };
}

export const noCtx = { params: Promise.resolve({}) } as never;

export async function makeAdmin() {
  const [u] = await db()<{ id: string }[]>`
    insert into users (username, display_name, role, password_hash) values ('admin1','Admin','admin','x') returning id`;
  return u.id;
}

/**
 * Simulated ESP32 for DEMO MODE. It talks to the real device API exactly like the
 * firmware should (same JSON, same endpoints, same rules), so it doubles as an
 * executable reference for the firmware team. Its device must be registered as
 * "simulated": the server labels all its data SIMULATED DATA and rejects it in
 * LIVE mode.
 *
 *   SIM_DEVICE_TOKEN=frx_dev_... npm run simulate -- --url http://localhost:3000 \
 *       --device T07-SIM --room R-305 --scenario heat [--seed 7]
 *
 * Scenarios: normal | heat (hair-dryer ramp to Danger and back) | fire | panic |
 *            outage (60 s offline buffering, then sync) | replay (resend a seq)
 */
import { heatIndexC, heatTrend, StatusMachine, DEFAULT_DEVICE_SETTINGS, type DeviceSettings } from "../src/lib/safety";

const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const URL_BASE = (arg("url", "http://localhost:3000") as string).replace(/\/$/, "");
const DEVICE = arg("device", "T07-SIM") as string;
const ROOM = arg("room", "R-305") as string;
const SCENARIO = arg("scenario", "normal") as string;
const TOKEN = process.env.SIM_DEVICE_TOKEN;
if (!TOKEN) {
  console.error("Set SIM_DEVICE_TOKEN (the simulated device's token from the Devices page).");
  process.exit(1);
}

// Deterministic PRNG (mulberry32) so a demo run is reproducible.
let seed = Number(arg("seed", "7"));
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

let seq = Math.floor(Date.now() / 1000); // monotonic across runs, like an NVS-backed counter
const boot = Date.now();
let settings: DeviceSettings = { ...DEFAULT_DEVICE_SETTINGS };
const machine = new StatusMachine(settings);
let fireLatched = false;
let door: "LOCKED" | "UNLOCKED" = "LOCKED";
const temps: number[] = [];
let offline = false;
const buffer: { kind: "telemetry" | "event"; body: Record<string, unknown> }[] = [];

const nowS = () => Math.floor(Date.now() / 1000);
const elapsed = () => (Date.now() - boot) / 1000;

async function call(path: string, body?: unknown) {
  const res = await fetch(`${URL_BASE}/api/device/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${TOKEN}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => null);
  return { status: res.status, body: j };
}

async function send(kind: "telemetry" | "event", body: Record<string, unknown>) {
  if (offline) {
    buffer.push({ kind, body });
    console.log(`[NET] OFFLINE buffered ${kind} seq=${body.seq} (waiting=${buffer.length})`);
    return;
  }
  const r = await call(kind === "telemetry" ? "/telemetry" : "/events", body);
  console.log(`[${kind === "telemetry" ? "TX" : "EVENT"}] seq=${body.seq} ${kind === "event" ? `${body.type} ${body.detail}` : ""} -> ${r.status}`);
}

function event(type: string, detail = "") {
  return send("event", { device_id: DEVICE, room_id: ROOM, seq: ++seq, ts: nowS(), type, detail });
}

/** Scenario-driven environment (°C, %RH, flame). */
function environment(t: number): { temp: number; rh: number; flame: boolean } {
  const noise = (rnd() - 0.5) * 0.3;
  if (SCENARIO === "heat") {
    // 0–90 s ramp 28 → 42 °C, hold 30 s, cool back to 27 °C by 220 s
    const temp = t < 90 ? 28 + (14 * t) / 90 : t < 120 ? 42 : Math.max(27, 42 - ((t - 120) * 15) / 100);
    return { temp: temp + noise, rh: 55, flame: false };
  }
  if (SCENARIO === "fire") return { temp: 29 + noise, rh: 60, flame: t > 20 && t < 50 };
  return { temp: 28.5 + Math.sin(t / 60) * 0.6 + noise, rh: 62 + noise * 4, flame: false };
}

async function telemetryTick() {
  const t = elapsed();
  const env = environment(t);
  temps.push(env.temp);
  if (temps.length > 10) temps.shift();
  const change = machine.update(Date.now(), env.temp, env.rh);
  if (change) await event("STATUS", `${change.from}->${change.to}`);
  if (env.flame && !fireLatched) {
    fireLatched = true;
    door = "UNLOCKED";
    await event("FIRE", "flame 2s");
  }
  const status = fireLatched ? "FIRE" : machine.status;
  await send("telemetry", {
    device_id: DEVICE, room_id: ROOM, seq: ++seq, ts: nowS(), uptime_s: Math.floor(t),
    temp_c: Math.round(env.temp * 10) / 10, rh: Math.round(env.rh), heat_index_c: heatIndexC(env.temp, env.rh),
    flame: env.flame, door, status, heat_trend: heatTrend(temps), rssi: -55 - Math.round(rnd() * 10),
    heap_kb: 180 + Math.round(rnd() * 6), chip_temp_c: 41 + Math.round(rnd() * 20) / 10, fw: "1.0.0-sim", quality: "good",
  });
}

async function pollTick() {
  if (offline) return;
  const r = await call("/poll");
  if (r.status !== 200) return;
  for (const c of r.body.commands as { id: string; type: string; payload: Record<string, unknown> }[]) {
    if (c.type === "APPLY_SETTINGS") {
      settings = c.payload.settings as DeviceSettings;
      machine.setSettings(settings);
      await event("SETTINGS_APPLIED", `v=${c.payload.version} warn=${settings.temp_warning_c} danger=${settings.temp_danger_c}`);
      await call(`/commands/${c.id}/ack`, { status: "applied", applied_version: c.payload.version });
    } else if (c.type === "FIRE_RESET") {
      const flameNow = environment(elapsed()).flame;
      if (flameNow) {
        await call(`/commands/${c.id}/ack`, { status: "rejected", message: "CANNOT RESET - FLAME PRESENT" });
      } else {
        fireLatched = false;
        door = "LOCKED";
        await event("STATUS", "FIRE->SAFE");
        await call(`/commands/${c.id}/ack`, { status: "applied", message: "door LOCKED" });
      }
    } else {
      await call(`/commands/${c.id}/ack`, { status: "rejected", message: "not supported by simulator" });
    }
  }
}

async function main() {
  console.log(`[SIM] ${DEVICE} room=${ROOM} scenario=${SCENARIO} -> ${URL_BASE}  (SIMULATED DATA)`);
  await event("BOOT", "reason=POWER_ON");
  if (SCENARIO === "panic") setTimeout(() => void event("PANIC", "touch 2s"), 15_000);
  if (SCENARIO === "outage") {
    setTimeout(() => { offline = true; console.log("[NET] OFFLINE"); }, 15_000);
    setTimeout(async () => {
      offline = false;
      console.log(`[NET] SYNCING n=${buffer.length}`);
      while (buffer.length) {
        const batch = buffer.splice(0, 50);
        const r = await call("/sync", { device_id: DEVICE, remaining: buffer.length, items: batch });
        console.log(`[NET] sync stored=${r.body?.stored} duplicates=${r.body?.duplicates}`);
      }
      console.log("[NET] LIVE");
    }, 75_000);
  }
  if (SCENARIO === "replay") {
    setTimeout(async () => {
      const r = await call("/telemetry", { device_id: DEVICE, room_id: ROOM, seq, ts: nowS(), uptime_s: 1, temp_c: 1, rh: 50, heat_index_c: 1, flame: false, door, status: "SAFE", heat_trend: null, rssi: -60, heap_kb: 180, chip_temp_c: 40, fw: "1.0.0-sim", quality: "good" });
      console.log(`[TEST] replay of seq=${seq} -> HTTP ${r.status} ${r.body?.error?.code ?? ""}`);
    }, 12_000);
  }
  setInterval(() => void telemetryTick().catch((e) => console.error("[ERROR]", e.message)), 5000);
  setInterval(() => void pollTick().catch((e) => console.error("[ERROR]", e.message)), 2000);
  await telemetryTick();
}

void main();

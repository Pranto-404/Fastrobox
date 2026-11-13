import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetConfigCache } from "@/lib/env";
import { sweepDeviceHealth } from "@/lib/device/ingest";
import { POST as telemetryPOST } from "@/app/api/device/v1/telemetry/route";
import { POST as eventsPOST } from "@/app/api/device/v1/events/route";
import { POST as syncPOST } from "@/app/api/device/v1/sync/route";
import { GET as pollGET } from "@/app/api/device/v1/poll/route";
import { POST as ackPOST } from "@/app/api/device/v1/commands/[id]/ack/route";
import { updateSettings } from "@/lib/settings";
import { deviceReq, event, makeAdmin, makeDevice, noCtx, nowS, resetDb, telemetry } from "./helpers";

const T = "/api/device/v1/telemetry";
const E = "/api/device/v1/events";
const count = async (table: string) => (await db().unsafe(`select count(*)::int as n from ${table}`))[0].n as number;

beforeEach(async () => {
  await resetDb();
  process.env.APP_MODE = "demo";
  resetConfigCache();
});

describe("device authentication", () => {
  it("rejects missing, malformed and unknown tokens", async () => {
    for (const tok of [null, "nope", "frx_dev_" + "x".repeat(43)]) {
      const res = await telemetryPOST(deviceReq(T, tok, telemetry(1)), noCtx);
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("device_unauthorized");
    }
  });
  it("identity comes from the token, not from device_id in the body", async () => {
    const a = await makeDevice({ uid: "T07-D1" });
    await makeDevice({ uid: "T07-D2" });
    const res = await telemetryPOST(deviceReq(T, a.token, telemetry(1, { device_id: "T07-D2" })), noCtx);
    expect(res.status).toBe(403);
    expect(await count("telemetry")).toBe(0);
  });
  it("rejects revoked tokens and simulated devices in LIVE mode", async () => {
    const a = await makeDevice();
    process.env.APP_MODE = "live";
    resetConfigCache();
    expect((await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx)).status).toBe(403);
    await db()`update device_credentials set revoked_at = now()`;
    expect((await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx)).status).toBe(401);
  });
});

describe("telemetry (fixed data format)", () => {
  it("accepts the question paper's example record", async () => {
    const a = await makeDevice();
    const res = await telemetryPOST(deviceReq(T, a.token, telemetry(1048)), noCtx);
    expect(res.status).toBe(201);
    const [row] = await db()`select room_id, temp_c, rh, heat_index_c, heat_trend, quality, clock_valid, is_simulated from telemetry`;
    expect(row).toMatchObject({ room_id: "R-305", heat_trend: "STABLE", quality: "good", clock_valid: true, is_simulated: true });
    expect(Number(row.heat_index_c)).toBeCloseTo(31.2);
  });
  it("links the device to the classroom with its Room ID, creating it if needed", async () => {
    const a = await makeDevice();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1, { room_id: "LAB-7" })), noCtx);
    const [d] = await db()`select d.room_id, c.room_code from devices d join classrooms c on c.id = d.classroom_id`;
    expect(d).toEqual({ room_id: "LAB-7", room_code: "LAB-7" });
  });
  it("rejects unknown fields, wrong types, missing fields, bad JSON, wrong content type", async () => {
    const a = await makeDevice();
    const bad = [telemetry(1, { tempC: 3 }), telemetry(1, { temp_c: "hot" }), telemetry(-1), { ...telemetry(1), quality: undefined }, telemetry(1, { status: "PANIC" })];
    for (const b of bad) expect((await telemetryPOST(deviceReq(T, a.token, b), noCtx)).status).toBe(422);
    expect((await telemetryPOST(deviceReq(T, a.token, "{oops"), noCtx)).status).toBe(400);
    const r = new Request("http://localhost" + T, { method: "POST", headers: { authorization: `Bearer ${a.token}`, "content-type": "text/plain" }, body: JSON.stringify(telemetry(1)) });
    expect((await telemetryPOST(r, noCtx)).status).toBe(415);
  });
  it("rejects a replay (same seq): 409 and the number of records does not change", async () => {
    const a = await makeDevice();
    expect((await telemetryPOST(deviceReq(T, a.token, telemetry(7)), noCtx)).status).toBe(201);
    expect((await telemetryPOST(deviceReq(T, a.token, telemetry(8)), noCtx)).status).toBe(201);
    const res = await telemetryPOST(deviceReq(T, a.token, telemetry(7, { temp_c: 45 })), noCtx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("replay_rejected");
    expect(await count("telemetry")).toBe(2);
  });
  it("seq is unique per device: events and telemetry share the device's counter space", async () => {
    const a = await makeDevice();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx);
    expect((await eventsPOST(deviceReq(E, a.token, event(1, "BOOT", "reason=POWER_ON")), noCtx)).status).toBe(201);
    expect((await eventsPOST(deviceReq(E, a.token, event(1, "BOOT", "reason=POWER_ON")), noCtx)).status).toBe(409);
  });
  it("uses the receive time when the device clock is not set (no NTP yet)", async () => {
    const a = await makeDevice();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1, { ts: 12 })), noCtx);
    const [row] = await db()`select clock_valid, abs(extract(epoch from recorded_at - received_at)) as d from telemetry`;
    expect(row.clock_valid).toBe(false);
    expect(Number(row.d)).toBeLessThan(2);
  });
});

describe("events and alerts", () => {
  it("BOOT stores the reset reason, CARD_TAP the last card", async () => {
    const a = await makeDevice();
    await eventsPOST(deviceReq(E, a.token, event(1, "BOOT", "reason=WATCHDOG")), noCtx);
    await eventsPOST(deviceReq(E, a.token, event(2, "CARD_TAP", "uid=04A1B2C3")), noCtx);
    const [d] = await db()`select last_reset_reason, last_card_uid from devices`;
    expect(d).toEqual({ last_reset_reason: "WATCHDOG", last_card_uid: "04A1B2C3" });
  });
  it("one FIRE alert per incident from telemetry + FIRE event; latch kept until the device confirms Reset fire", async () => {
    const a = await makeDevice();
    const admin = await makeAdmin();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx);
    await telemetryPOST(deviceReq(T, a.token, telemetry(2, { flame: true, status: "FIRE", door: "UNLOCKED" })), noCtx);
    await eventsPOST(deviceReq(E, a.token, event(3, "FIRE", "flame 2s")), noCtx);
    expect(await db()`select alert_type, severity, status from alerts`).toEqual([{ alert_type: "FIRE", severity: "critical", status: "open" }]);
    expect((await db()`select fire_latched from devices`)[0].fire_latched).toBe(true);

    const { requestFireReset } = await import("@/lib/control");
    const cmdId = await requestFireReset(a.id, admin, null);
    expect((await db()`select fire_latched from devices`)[0].fire_latched).toBe(true); // not until the device confirms
    const res = await ackPOST(deviceReq("/x", a.token, { status: "applied", message: "door LOCKED" }), { params: Promise.resolve({ id: cmdId }) });
    expect(res.status).toBe(200);
    expect((await db()`select fire_latched from devices`)[0].fire_latched).toBe(false);
    expect((await db()`select status from alerts`)[0].status).toBe("resolved");
  });
  it("heat alerts follow the device status; quality=bad raises SENSOR_ERROR", async () => {
    const a = await makeDevice();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1, { status: "WARNING", temp_c: 33 })), noCtx);
    await telemetryPOST(deviceReq(T, a.token, telemetry(2, { status: "DANGER", temp_c: 41 })), noCtx);
    await telemetryPOST(deviceReq(T, a.token, telemetry(3, { status: "DANGER", temp_c: null, rh: null, heat_index_c: null, quality: "bad" })), noCtx);
    await telemetryPOST(deviceReq(T, a.token, telemetry(4, { status: "SAFE", temp_c: 29 })), noCtx);
    const rows = await db()`select alert_type, status from alerts order by id`;
    expect(rows).toEqual([
      { alert_type: "HEAT_WARNING", status: "resolved" },
      { alert_type: "HEAT_DANGER", status: "resolved" },
      { alert_type: "SENSOR_ERROR", status: "resolved" },
    ]);
  });
});

describe("offline detection (within 30 s) and recovery", () => {
  it("sweep marks a silent device offline once; reconnection logs DEVICE_ONLINE and resolves the alert", async () => {
    const a = await makeDevice();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx);
    expect(await sweepDeviceHealth()).toBe(0);
    await db()`update devices set last_seen_at = now() - interval '16 seconds'`;
    expect(await sweepDeviceHealth()).toBe(1);
    expect(await sweepDeviceHealth()).toBe(0);
    expect((await db()`select connection_state from devices`)[0].connection_state).toBe("offline");
    await telemetryPOST(deviceReq(T, a.token, telemetry(2)), noCtx);
    const ev = await db()`select event_type from device_events where origin='server' order by id`;
    // first connection (never_seen → online), then the outage and the recovery
    expect(ev.map((e) => e.event_type)).toEqual(["DEVICE_ONLINE", "DEVICE_OFFLINE", "DEVICE_ONLINE"]);
    expect((await db()`select status from alerts where alert_type='DEVICE_OFFLINE'`)[0].status).toBe("resolved");
  });
});

describe("offline buffer sync (Level 12)", () => {
  it("stores each record once with its original time, oldest first; keeps the newest status", async () => {
    const a = await makeDevice();
    const now = nowS();
    await telemetryPOST(deviceReq(T, a.token, telemetry(10, { ts: now })), noCtx);
    const old = now - 600;
    const body = {
      device_id: "T07-D1",
      remaining: 0,
      items: [
        { kind: "telemetry", body: telemetry(3, { ts: old, status: "DANGER", temp_c: 41 }) },
        { kind: "event", body: event(4, "OFFLINE_ENTRY", "uid=04A1B2C3", { ts: old + 5 }) },
        { kind: "telemetry", body: telemetry(10, { ts: now }) },
      ],
    };
    const j = await (await syncPOST(deviceReq("/api/device/v1/sync", a.token, body), noCtx)).json();
    expect(j).toMatchObject({ received: 3, stored: 2, duplicates: 1 });
    const [r] = await db()`select recorded_at, is_offline_replay from telemetry where seq = 3`;
    expect(new Date(r.recorded_at).getTime()).toBe(old * 1000);
    expect(r.is_offline_replay).toBe(true);
    expect((await db()`select last_status from devices`)[0].last_status).toBe("SAFE");
    const again = await (await syncPOST(deviceReq("/api/device/v1/sync", a.token, body), noCtx)).json();
    expect(again).toMatchObject({ stored: 0, duplicates: 3 });
    expect(await count("telemetry")).toBe(2);
  });
});

describe("remote settings (Level 5)", () => {
  it("queues settings, the device polls and confirms; state changes only by device ack", async () => {
    const a = await makeDevice();
    const admin = await makeAdmin();
    await telemetryPOST(deviceReq(T, a.token, telemetry(1)), noCtx);
    const up = await updateSettings(a.id, { temp_warning_c: 28, temp_danger_c: 40 }, admin, null);
    expect(up.version).toBe(1);
    const poll = await (await pollGET(deviceReq("/api/device/v1/poll", a.token), noCtx)).json();
    expect(poll.settings).toEqual({ version: 1, temp_warning_c: 28, temp_danger_c: 40 });
    expect(poll.commands[0]).toMatchObject({ type: "APPLY_SETTINGS", payload: { version: 1 } });
    const ctx = { params: Promise.resolve({ id: poll.commands[0].id }) };
    expect((await ackPOST(deviceReq("/x", a.token, { status: "applied", applied_version: 9 }), ctx)).status).toBe(422);
    expect((await ackPOST(deviceReq("/x", a.token, { status: "applied", applied_version: 1 }), ctx)).status).toBe(200);
    expect((await ackPOST(deviceReq("/x", a.token, { status: "failed" }), ctx)).status).toBe(409);
  });
  it("another device cannot acknowledge the command", async () => {
    const a = await makeDevice({ uid: "T07-D1" });
    const b = await makeDevice({ uid: "T07-D2" });
    const up = await updateSettings(a.id, { temp_warning_c: 30, temp_danger_c: 40 }, await makeAdmin(), null);
    const res = await ackPOST(deviceReq("/x", b.token, { status: "applied", applied_version: 1 }), { params: Promise.resolve({ id: up.command_id }) });
    expect(res.status).toBe(404);
  });
  it("refuses 45 °C and records who changed what", async () => {
    const a = await makeDevice();
    const admin = await makeAdmin();
    await expect(updateSettings(a.id, { temp_warning_c: 45, temp_danger_c: 40 }, admin, null)).rejects.toThrow(/below the Danger/);
    await updateSettings(a.id, { temp_warning_c: 30, temp_danger_c: 40 }, admin, null);
    const [log] = await db()`select actor_user_id, action, details from audit_logs where action = 'device.settings.update'`;
    expect(log.actor_user_id).toBe(admin);
    expect(log.details.settings).toEqual({ temp_warning_c: 30, temp_danger_c: 40 });
  });
});

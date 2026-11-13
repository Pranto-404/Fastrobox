import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkEsp32Image, deployFirmware, uploadFirmware } from "@/lib/ota";
import { GET as pollGET } from "@/app/api/device/v1/poll/route";
import { GET as fwGET } from "@/app/api/device/v1/ota/[jobId]/firmware/route";
import { POST as progressPOST } from "@/app/api/device/v1/ota/[jobId]/progress/route";
import { POST as eventsPOST } from "@/app/api/device/v1/events/route";
import { deviceReq, event, makeAdmin, makeDevice, noCtx, resetDb } from "./helpers";

/** A structurally valid fake ESP32 app image: header + 2 segments + checksum padding. */
function image(): Buffer {
  const hdr = Buffer.alloc(24);
  hdr[0] = 0xe9;
  hdr[1] = 2;
  const seg = (n: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(n, 4); return Buffer.concat([h, Buffer.alloc(n, 0xab)]); };
  const body = Buffer.concat([hdr, seg(4000), seg(6000)]);
  return Buffer.concat([body, Buffer.alloc(16 - (body.length % 16) + 32)]);
}

beforeEach(resetDb);

describe("firmware image check", () => {
  it("accepts a well-formed image and detects a file cut in half or with the wrong magic", () => {
    const img = image();
    expect(checkEsp32Image(img)).toEqual({ ok: true, segments: 2 });
    expect(checkEsp32Image(img.subarray(0, img.length / 2))).toMatchObject({ ok: false, reason: expect.stringMatching(/truncated/) });
    const bad = Buffer.from(img); bad[0] = 0;
    expect(checkEsp32Image(bad)).toMatchObject({ ok: false });
  });
});

describe("OTA flow (server side)", () => {
  it("upload → deploy → device sees command → downloads with sha256 → progress → OTA_DONE", async () => {
    const admin = await makeAdmin();
    const d = await makeDevice();
    const img = image();
    const up = await uploadFirmware(new File([new Uint8Array(img)], "fw-1.0.1.bin"), "1.0.1", null, admin, null, 4 * 1024 * 1024);
    expect(up.check.ok).toBe(true);
    const { job_id } = await deployFirmware(d.id, up.id, admin, null);
    await expect(deployFirmware(d.id, up.id, admin, null)).rejects.toThrow(/already in progress/);

    const poll = await (await pollGET(deviceReq("/api/device/v1/poll", d.token), noCtx)).json();
    const cmd = poll.commands.find((c: { type: string }) => c.type === "OTA_UPDATE");
    expect(cmd.payload).toMatchObject({ job_id, version: "1.0.1", size: img.length, sha256: up.sha256 });

    const other = await makeDevice({ uid: "T07-D9" });
    expect((await fwGET(deviceReq("/x", other.token), { params: Promise.resolve({ jobId: job_id }) })).status).toBe(404);
    const res = await fwGET(deviceReq("/x", d.token), { params: Promise.resolve({ jobId: job_id }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-firmware-sha256")).toBe(up.sha256);
    expect(Buffer.from(await res.arrayBuffer()).equals(img)).toBe(true);

    expect((await progressPOST(deviceReq("/x", d.token, { status: "installed", progress: 100 }), { params: Promise.resolve({ jobId: job_id }) })).status).toBe(200);
    await eventsPOST(deviceReq("/api/device/v1/events", d.token, event(5, "OTA_DONE", "1.0.1")), noCtx);
    const [j] = await db()`select status, progress from ota_jobs`;
    expect(j).toEqual({ status: "done", progress: 100 });
  });

  it("damaged file: server flags it, can still be sent, device reports OTA_REJECTED", async () => {
    const admin = await makeAdmin();
    const d = await makeDevice();
    const img = image();
    const up = await uploadFirmware(new File([new Uint8Array(img.subarray(0, img.length / 2))], "half.bin"), "1.0.1-half", null, admin, null, 4 * 1024 * 1024);
    expect(up.check.ok).toBe(false);
    await deployFirmware(d.id, up.id, admin, null);
    await eventsPOST(deviceReq("/api/device/v1/events", d.token, event(6, "OTA_REJECTED", "sha256 mismatch")), noCtx);
    expect((await db()`select status from ota_jobs`)[0].status).toBe("rejected");
    expect((await db()`select count(*)::int as n from device_events where event_type = 'OTA_REJECTED'`)[0].n).toBe(1);
  });
});

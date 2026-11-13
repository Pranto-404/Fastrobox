import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setFaceVerifier } from "@/lib/face";
import { finalizeAbsences } from "@/lib/attendance";
import { POST as telemetryPOST } from "@/app/api/device/v1/telemetry/route";
import { POST as checkinPOST } from "@/app/api/device/v1/checkin/route";
import { POST as syncPOST } from "@/app/api/device/v1/sync/route";
import { GET as pollGET } from "@/app/api/device/v1/poll/route";
import { deviceReq, event, makeDevice, noCtx, nowS, resetDb, telemetry } from "./helpers";

// A minimal valid JPEG header + padding (the face service is mocked).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]).toString("base64");
const UID = { A: "0A0A0A0A", B: "0B0B0B0B", C: "0C0C0C0C", D: "0D0D0D0D", X: "0E0E0E0E" };

/** Who is really in front of the camera (the mocked face model's answer). */
let faceOf = "A";
let live = true;

let token = "";
let seq = 100;
const checkin = async (uid: string) => {
  const res = await checkinPOST(
    deviceReq("/api/device/v1/checkin", token, {
      device_id: "T07-D1", room_id: "R-305", seq: seq++, ts: nowS(), uid, face_jpeg_b64: JPEG, face_w: 96, face_h: 112,
    }),
    noCtx,
  );
  return res.json();
};

async function setClassStart(minutesAgo: number, room = "R-305") {
  await db()`
    update class_schedules s set start_time = date_trunc('second', (now() at time zone 'Asia/Dhaka') - make_interval(mins => ${minutesAgo}))::time,
           end_time = '23:59:59', day_of_week = extract(dow from (now() at time zone 'Asia/Dhaka'))
      from classrooms c where c.id = s.classroom_id and c.room_code = ${room}`;
}

beforeEach(async () => {
  await resetDb();
  faceOf = "A";
  live = true;
  // Mock face model: embeddings are tagged with the student code they belong to.
  setFaceVerifier(async ({ embeddings }) => {
    const owner = embeddings[0][0];
    const presented = faceOf.charCodeAt(0);
    return { ok: true, match: owner === presented, distance: owner === presented ? 0.3 : 0.9, threshold: 0.6, live, liveness_score: live ? 0.95 : 0.1 };
  });
  const dev = await makeDevice();
  token = dev.token;
  await telemetryPOST(deviceReq("/api/device/v1/telemetry", token, telemetry(1)), noCtx); // links device to R-305
  const sql = db();
  const [room] = await sql`select id from classrooms where room_code = 'R-305'`;
  const [other] = await sql`insert into classrooms (room_code, name) values ('R-999', 'Other') returning id`;
  const [guardian] = await sql`insert into users (username, display_name, role, password_hash) values ('guardian1','Guardian','guardian','x') returning id`;
  for (const code of ["A", "B", "C", "D"]) {
    const [s] = await sql`insert into students (student_code, full_name, classroom_id)
                          values (${code}, ${"Student " + code}, ${code === "C" ? other.id : room.id}) returning id`;
    await sql`insert into face_embeddings (student_id, model, dims, embedding) values (${s.id}, 'mock', 2, ${[code.charCodeAt(0), 0]})`;
    if (code !== "D") await sql`insert into rfid_cards (uid, student_id) values (${UID[code as "A"]}, ${s.id})`;
    if (code === "B" || code === "D") await sql`insert into guardian_student_links (guardian_id, student_id) values (${guardian.id}, ${s.id})`;
  }
  await sql`insert into class_schedules (classroom_id, subject, day_of_week, start_time, end_time) values (${room.id}, 'Physics', 0, '00:00', '23:59')`;
  await sql`insert into class_schedules (classroom_id, subject, day_of_week, start_time, end_time) values (${other.id}, 'Chemistry', 0, '00:00', '23:59')`;
  await setClassStart(0);
  await setClassStart(0, "R-999");
});

afterEach(() => setFaceVerifier(null));

describe("Level 7 check-in", () => {
  it("A is Present; a second check-in opens the door but adds no record", async () => {
    const r1 = await checkin(UID.A);
    expect(r1).toMatchObject({ decision: "GRANTED", reason: "PRESENT", unlock_ms: 5000, attendance: { new_record: true } });
    const r2 = await checkin(UID.A);
    expect(r2).toMatchObject({ decision: "GRANTED", reason: "ALREADY_CHECKED_IN", attendance: { status: "PRESENT", new_record: false } });
    expect((await db()`select count(*)::int as n from attendance`)[0].n).toBe(1);
  });

  it("B checks in 11 minutes after the start: Late, and the Guardian is notified", async () => {
    await setClassStart(11);
    faceOf = "B";
    expect(await checkin(UID.B)).toMatchObject({ decision: "GRANTED", reason: "LATE" });
    const n = await db()`select kind, message from guardian_notifications`;
    expect(n).toHaveLength(1);
    expect(n[0].kind).toBe("LATE");
  });

  it("denials: NOT IN THIS CLASS, UNKNOWN CARD, NO CLASS NOW", async () => {
    faceOf = "C";
    expect(await checkin(UID.C)).toMatchObject({ decision: "DENIED", reason: "NOT_IN_THIS_CLASS", text: "NOT IN THIS CLASS" });
    expect(await checkin(UID.X)).toMatchObject({ decision: "DENIED", reason: "UNKNOWN_CARD", text: "UNKNOWN CARD" });
    await db()`delete from class_schedules`;
    faceOf = "A";
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", reason: "NO_CLASS_NOW", text: "NO CLASS NOW" });
    const ev = await db()`select event_type from device_events where event_type = 'UNKNOWN_CARD'`;
    expect(ev).toHaveLength(1);
  });

  it("class start 31 minutes ago: D is marked Absent; A stays Present, B stays Late; Guardian sees B and D only", async () => {
    await setClassStart(0);
    await checkin(UID.A);
    await setClassStart(11);
    faceOf = "B";
    await checkin(UID.B);
    await setClassStart(31);
    expect(await finalizeAbsences()).toBe(1); // D only (C is in another class whose start is "now")
    const rows = await db()`select s.student_code, a.status from attendance a join students s on s.id = a.student_id order by 1`;
    expect(rows).toEqual([
      { student_code: "A", status: "PRESENT" },
      { student_code: "B", status: "LATE" },
      { student_code: "D", status: "ABSENT" },
    ]);
    const n = await db()`select s.student_code, g.kind from guardian_notifications g join students s on s.id = g.student_id order by 1`;
    expect(n).toEqual([{ student_code: "B", kind: "LATE" }, { student_code: "D", kind: "ABSENT" }]);
    expect(await finalizeAbsences()).toBe(0); // idempotent
  });

  it("never falls back to the card alone when the face service is unavailable", async () => {
    setFaceVerifier(async () => ({ ok: false, error: "FACE_SERVICE_UNAVAILABLE" }));
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", reason: "FACE_SERVICE_UNAVAILABLE" });
    expect((await db()`select count(*)::int as n from attendance`)[0].n).toBe(0);
  });
});

describe("Level 8 spoofing and lockout", () => {
  it("B with A's card: FACE MISMATCH with a private snapshot and alert; 3rd mismatch blocks the card even for A; Admin unblock lets A in", async () => {
    faceOf = "B";
    for (let i = 0; i < 3; i++) expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", reason: "FACE_MISMATCH" });
    const snaps = await db()`select kind from private_snapshots`;
    expect(snaps).toHaveLength(3);
    const alerts = await db()`select alert_type, snapshot_id is not null as has_snap from alerts order by id`;
    expect(alerts.filter((a) => a.alert_type === "FACE_MISMATCH").every((a) => a.has_snap)).toBe(true);
    expect(alerts.some((a) => a.alert_type === "CARD_BLOCKED")).toBe(true);
    faceOf = "A";
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", reason: "CARD_BLOCKED", text: "CARD BLOCKED" });
    await db()`update rfid_cards set blocked_until = null where uid = ${UID.A}`; // Admin unblock
    expect(await checkin(UID.A)).toMatchObject({ decision: "GRANTED", reason: "PRESENT" });
  });

  it("a photo on a phone (liveness fails) never unlocks the door", async () => {
    live = false;
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", reason: "SPOOF" });
    expect((await db()`select event_type from device_events where event_type = 'SPOOF'`)).toHaveLength(1);
  });
});

describe("Level 9 camera rules for check-in", () => {
  it("ROOM position: CAMERA NOT AT DOOR; covered camera: CAMERA FAULT", async () => {
    await db()`update devices set camera_position = 'ROOM'`;
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", text: "CAMERA NOT AT DOOR" });
    await db()`update devices set camera_position = 'DOOR', camera_state = 'COVERED'`;
    expect(await checkin(UID.A)).toMatchObject({ decision: "DENIED", text: "CAMERA FAULT" });
  });
});

describe("Level 12 offline entry", () => {
  it("poll gives the running class's card UIDs; an OFFLINE_ENTRY replay marks attendance at the tap time, face not verified", async () => {
    await setClassStart(5);
    const poll = await (await pollGET(deviceReq("/api/device/v1/poll", token), noCtx)).json();
    expect(poll.offline_cards).toEqual([UID.A, UID.B].sort());
    const tapTs = nowS() - 60;
    await syncPOST(deviceReq("/api/device/v1/sync", token, {
      device_id: "T07-D1", remaining: 0, items: [{ kind: "event", body: event(500, "OFFLINE_ENTRY", `uid=${UID.A}`, { ts: tapTs }) }],
    }), noCtx);
    const [a] = await db()`select status, method, face_verified, first_seen_at from attendance`;
    expect(a).toMatchObject({ status: "PRESENT", method: "OFFLINE_CARD", face_verified: false });
    expect(new Date(a.first_seen_at).getTime()).toBe(tapTs * 1000);
  });
});

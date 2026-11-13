/**
 * Device API v1 request schemas — the contract with the ESP32 firmware.
 * Telemetry and event fields follow the question paper's fixed data format
 * (section 6) exactly. Objects are strict: unknown fields are rejected so
 * firmware typos surface immediately. Documented in docs/API_CONTRACT.md.
 */
import { z } from "zod";
import { HEAT_TRENDS, STATUSES } from "../safety";

/** Earliest plausible NTP-synced time; anything earlier means the clock is not set. */
const MIN_VALID_CLOCK_S = Date.UTC(2025, 0, 1) / 1000;
const MAX_FUTURE_SKEW_S = 5 * 60;

export function parseDeviceTs(ts: number | undefined, nowMs = Date.now()): { date: Date | null; valid: boolean } {
  if (ts === undefined || !Number.isFinite(ts)) return { date: null, valid: false };
  const valid = ts >= MIN_VALID_CLOCK_S && ts <= nowMs / 1000 + MAX_FUTURE_SKEW_S;
  return { date: valid ? new Date(ts * 1000) : null, valid };
}

export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{2,64}$/, "device_id must be 2-64 letters, digits, - or _");
export const roomIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, "room_id must be 1-32 letters, digits, - or _");
const seq = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
/** Unix time in seconds (UTC). */
const ts = z.number().int().min(0).max(2 ** 40);

export const cardUid = z
  .string()
  .transform((s) => s.replace(/[\s:-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^[0-9A-F]{8,20}$/, "card uid must be 8-20 hex digits"));

export const telemetrySchema = z.strictObject({
  device_id: deviceIdSchema,
  room_id: roomIdSchema,
  seq,
  ts,
  uptime_s: z.number().int().min(0),
  temp_c: z.number().min(-40).max(125).nullable(),
  rh: z.number().min(0).max(100).nullable(),
  heat_index_c: z.number().min(-60).max(150).nullable(),
  flame: z.boolean(),
  door: z.enum(["LOCKED", "UNLOCKED"]),
  status: z.enum(STATUSES),
  heat_trend: z.enum(HEAT_TRENDS).nullable(),
  rssi: z.number().int().min(-127).max(0).nullable(),
  heap_kb: z.number().int().min(0).max(1_000_000),
  chip_temp_c: z.number().min(-40).max(150).nullable(),
  fw: z.string().regex(/^[0-9A-Za-z.+_-]{1,40}$/),
  quality: z.enum(["good", "bad"]),
});
export type TelemetryPayload = z.infer<typeof telemetrySchema>;

/** Device events (question paper section 6). */
export const DEVICE_EVENT_TYPES = [
  "BOOT",
  "STATUS",
  "FIRE",
  "FIRE_CLEARED",
  "SILENCED",
  "PANIC",
  "CARD_TAP",
  "ENTRY_GRANTED",
  "ENTRY_DENIED",
  "NO_FACE",
  "OFFLINE_ENTRY",
  "SENSOR_ERROR",
  "SETTINGS_APPLIED",
  "OTA_DONE",
  "OTA_REJECTED",
  "OTA_ROLLBACK",
] as const;
export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

/** Server events (same fields, server id in place of seq). */
export const SERVER_EVENT_TYPES = [
  "UNKNOWN_CARD",
  "FACE_MISMATCH",
  "SPOOF",
  "CARD_BLOCKED",
  "STUDENT_DELETED",
  "WEATHER_ALERT",
  "OCCUPANCY",
  "OVER_CAPACITY",
  "INTRUDER",
  "CAMERA_FAULT",
  "CAMERA_OK",
  "HAND_RAISED",
  "PRESENCE",
  "ACK",
  // platform bookkeeping (not in the paper's list, documented in API_CONTRACT.md)
  "DEVICE_OFFLINE",
  "DEVICE_ONLINE",
] as const;
export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];

export const eventSchema = z.strictObject({
  device_id: deviceIdSchema,
  room_id: roomIdSchema,
  seq,
  ts,
  type: z.enum(DEVICE_EVENT_TYPES),
  detail: z.string().max(500).default(""),
});
export type EventPayload = z.infer<typeof eventSchema>;

/**
 * Level 7 check-in: the card UID plus the face crop found ON THE DEVICE.
 * Only the cropped face is sent (base64 JPEG, ≤ 64 KB decoded); it is never stored.
 */
export const checkinSchema = z.strictObject({
  device_id: deviceIdSchema,
  room_id: roomIdSchema,
  seq,
  ts,
  uid: cardUid,
  face_jpeg_b64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "face_jpeg_b64 must be base64").max(90_000),
  face_w: z.number().int().min(8).max(1600),
  face_h: z.number().int().min(8).max(1600),
});
export type CheckinPayload = z.infer<typeof checkinSchema>;

export const syncSchema = z.strictObject({
  device_id: deviceIdSchema,
  /** Records still waiting on the device after this batch (drives SYNCING → LIVE). */
  remaining: z.number().int().min(0).max(1_000_000),
  items: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({ kind: z.literal("telemetry"), body: telemetrySchema }),
        z.strictObject({ kind: z.literal("event"), body: eventSchema }),
      ]),
    )
    .min(1)
    .max(200),
});
export type SyncPayload = z.infer<typeof syncSchema>;

export const commandAckSchema = z.strictObject({
  status: z.enum(["applied", "failed", "rejected"]),
  message: z.string().max(300).optional(),
  applied_version: z.number().int().positive().optional(),
});

export const otaProgressSchema = z.strictObject({
  status: z.enum(["downloading", "verifying", "installed", "done", "rejected", "failed", "rolled_back"]),
  progress: z.number().int().min(0).max(100).optional(),
  message: z.string().max(300).optional(),
  running_version: z.string().regex(/^[0-9A-Za-z.+_-]{1,40}$/).optional(),
});

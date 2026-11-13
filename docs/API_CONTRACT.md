# Device API v1 — contract for the ESP32-S3 firmware

Base URL: `https://<platform-host>/api/device/v1` (HTTPS only; the firmware **must verify the
server certificate**, e.g. with the root CA bundle, never `setInsecure()`).

Field names, units and event types follow the **printed question paper, section 6 ("Fixed Data
Format")**. All request bodies are JSON (`Content-Type: application/json`) and are validated
strictly: an unknown or misspelled field is rejected with HTTP 422.

## Authentication

Every call except `GET /time` carries the device token typed on the setup page:

```
Authorization: Bearer frx_dev_<43 url-safe characters>
```

* The Admin creates the device on **Admin → Devices** and copies the token (shown once).
* The token identifies the device. `device_id` in the body must equal the registered
  Device ID (for example `T07-D1`), otherwise HTTP 403 `device_mismatch`.
* Tokens are stored hashed on the server; rotate on the Devices page if a token leaks.
* Never compile the token into the firmware: it is entered on the setup page and kept in NVS.

## Error format

```json
{ "error": { "code": "replay_rejected", "message": "seq 1048 already stored", "details": { "seq": 1048 } } }
```

| HTTP | code | Meaning / firmware action |
|---|---|---|
| 400 | `invalid_json` | Body is not JSON — firmware bug, do not retry |
| 401 | `device_unauthorized` | Missing/wrong/revoked token — show on the local page, re-enter token |
| 403 | `device_mismatch`, `simulated_device_rejected` | Wrong device_id / simulated device in LIVE mode |
| 409 | `replay_rejected` | This `seq` is already stored — treat as **delivered**, drop it from the queue |
| 413 / 415 | `payload_too_large` / `unsupported_media_type` | Firmware bug |
| 422 | `validation_failed` | `details[]` lists `{path, message}` — firmware bug, log it |
| 5xx | `internal_error` | Keep the record and retry with back-off |

## Sequence numbers and time

* `seq`: one counter per device, shared by telemetry **and** events, that only increases, even
  across restarts (persist it in NVS; e.g. reserve blocks of 100 to limit flash writes). Never reuse.
* The server stores `(device_id, seq)` once; a repeat returns **409 `replay_rejected`** and the
  record count does not change (judge check A4).
* `ts`: Unix time in **seconds** (UTC) when the reading was taken, from NTP. If the clock is not
  yet synced (ts before 2025-01-01) the server uses its receive time and flags `clock_valid=false`.
  `GET /time` returns the server clock if NTP is unavailable.

## POST /telemetry — every 5 ± 1 s

```json
{"device_id":"T07-D1","room_id":"R-305","seq":1048,"ts":1794567890,"uptime_s":742,
 "temp_c":29.0,"rh":64,"heat_index_c":31.2,"flame":false,"door":"LOCKED","status":"SAFE",
 "heat_trend":"STABLE","rssi":-61,"heap_kb":182,"chip_temp_c":41.5,"fw":"1.0.0","quality":"good"}
```

| Field | Type | Rule |
|---|---|---|
| device_id | string | `^[A-Za-z0-9_-]{2,64}$`, must match the token's device |
| room_id | string | Room ID from the setup page, `^[A-Za-z0-9_-]{1,32}$`. The server links the device to that classroom (created if new) |
| seq | integer ≥ 0 | see above |
| ts | integer | Unix seconds, time of the reading |
| uptime_s | integer | seconds since this start-up |
| temp_c, rh, heat_index_c | number or `null` | `null` when the reading is bad (quality `bad`) |
| flame | boolean | |
| door | `LOCKED` \| `UNLOCKED` | |
| status | `SAFE` \| `WARNING` \| `DANGER` \| `FIRE` | after the 3 s hold (FIRE immediately) |
| heat_trend | `RISING` \| `STABLE` \| `FALLING` \| `null` | from the last 10 readings |
| rssi | integer dBm or `null` | |
| heap_kb | integer | free heap in KB |
| chip_temp_c | number or `null` | `temperatureRead()` |
| fw | string | e.g. `1.0.0` |
| quality | `good` \| `bad` | `bad` if any reading is not trustworthy (outside 0–50 °C or 20–90 %) |

Response `201 {"ok":true,"id":…,"seq":1048,"server_time":1794567891}`.

## POST /events — at once

```json
{"device_id":"T07-D1","room_id":"R-305","seq":1049,"ts":1794567893,"type":"CARD_TAP","detail":"uid=04A1B2C3"}
```

Device event types (paper §6): `BOOT` (detail `reason=WATCHDOG` etc.), `STATUS` (`SAFE->WARNING`),
`FIRE`, `FIRE_CLEARED`, `SILENCED`, `PANIC`, `CARD_TAP` (`uid=…`), `ENTRY_GRANTED`, `ENTRY_DENIED`,
`NO_FACE`, `OFFLINE_ENTRY` (`uid=…`), `SENSOR_ERROR` (`DHT11` / `RFID`), `SETTINGS_APPLIED`,
`OTA_DONE`, `OTA_REJECTED`, `OTA_ROLLBACK`. `detail` is a string ≤ 500 characters.

Server side effects: `BOOT` → last reset reason in the health panel; `CARD_TAP` → last card;
`FIRE`/`PANIC` → alert + red banner + phone message; `SENSOR_ERROR` → alert;
`OTA_*` → OTA job status; `OFFLINE_ENTRY` → attendance at the tap time, flagged face-not-verified.

Server events (paper §6, stored in the same table with `origin=server`, the row id in place of
`seq`): `UNKNOWN_CARD`, `FACE_MISMATCH`, `SPOOF`, `CARD_BLOCKED`, `STUDENT_DELETED`,
`WEATHER_ALERT`, `OCCUPANCY`, `OVER_CAPACITY`, `INTRUDER`, `CAMERA_FAULT`, `CAMERA_OK`,
`HAND_RAISED`, `PRESENCE`, `ACK`, plus `DEVICE_OFFLINE` / `DEVICE_ONLINE`.

## GET /poll — every 2 s

One call gives the device everything it must react to within the paper's limits
(settings ≤ 10 s, weather Danger ≤ 10 s, Reset fire):

```json
{
  "ok": true,
  "commands": [{ "id": "uuid", "type": "APPLY_SETTINGS", "payload": { "version": 3, "settings": { "temp_warning_c": 28, "temp_danger_c": 40 } } }],
  "settings": { "version": 3, "temp_warning_c": 28, "temp_danger_c": 40 },
  "weather": { "line": "29°C, light rain", "fetched_at": 1794567000, "danger_notice": { "id": 12, "text": "Cyclone warning…" } },
  "teacher_tags": ["0A1B2C3D"],
  "class_now": { "subject": "Physics" },
  "offline_cards": ["04A1B2C3", "04B1C2D3"],
  "camera": { "position": "DOOR", "night_mode": false },
  "server_time": 1794567891
}
```

* `settings` is the latest requested version; apply it, save it in NVS, send `SETTINGS_APPLIED`
  and acknowledge the command.
* `weather.danger_notice` non-null → purple light, three beeps once, `WEATHER ALERT <text>` on
  the local page; null again → clear it.
* `teacher_tags` → store in NVS (Teacher-tag silence works offline).
* `offline_cards` → the cards of the class running now; store in NVS for offline entry (Level 12).

Command types: `APPLY_SETTINGS`, `FIRE_RESET`, `OTA_UPDATE`, `CAMERA_POSITION`, `NIGHT_MODE`.
Commands are re-sent on every poll until acknowledged or expired.

## POST /commands/{id}/ack

```json
{ "status": "applied", "applied_version": 3, "message": "optional text" }
```

`status`: `applied` | `failed` | `rejected`. For `APPLY_SETTINGS` + `applied`, `applied_version`
must equal `payload.version`. For `FIRE_RESET`, reply `applied` only after the door is LOCKED
again, or `rejected` with `CANNOT RESET - FLAME PRESENT`. The dashboard shows a command as done
**only** after this acknowledgement. A second ack → 409 `command_closed`.

## POST /checkin — Level 7

After a card tap, the device finds a face itself (on-device detection). No face within 3 s → deny
`NO FACE` locally, send a `NO_FACE` event, do **not** call the server. Otherwise:

```json
{"device_id":"T07-D1","room_id":"R-305","seq":1050,"ts":1794567900,"uid":"04A1B2C3",
 "face_jpeg_b64":"/9j/4AAQ…","face_w":96,"face_h":112}
```

Only the cropped face (JPEG ≤ 64 KB). Response:

```json
{"ok":true,"decision":"GRANTED","reason":"PRESENT","text":"Student One PRESENT","unlock_ms":5000,
 "student":{"code":"S1","name":"Student One"},
 "attendance":{"status":"PRESENT","class_date":"2026-11-13","subject":"Physics","new_record":true}}
```

`reason` for denials: `CAMERA_NOT_AT_DOOR`, `CAMERA_FAULT`, `UNKNOWN_CARD`, `CARD_BLOCKED`,
`NO_CLASS_NOW`, `NOT_IN_THIS_CLASS`, `FACE_MISMATCH`, `SPOOF`, `NOT_ENROLLED`,
`FACE_SERVICE_UNAVAILABLE`. `text` is the human form for the Serial Monitor/local page
(`NOT IN THIS CLASS`). The device then sends its own `ENTRY_GRANTED <name>` / `ENTRY_DENIED <reason>` event.
There is never a card-only fallback.

## POST /sync — Level 12 offline buffer

```json
{"device_id":"T07-D1","remaining":120,
 "items":[{"kind":"telemetry","body":{…telemetry…}},{"kind":"event","body":{…event…}}]}
```

Oldest first, ≤ 200 items per call, original `seq` and `ts`. Response lists each item as
`stored` or `duplicate`; both mean "delivered — delete from flash". `remaining` drives
SYNCING → LIVE on the dashboard. Half-written records must be discarded on the device
(e.g. CRC per record).

## OTA (Level 5)

`OTA_UPDATE` command payload: `{"job_id","version","size","sha256","path"}`.

1. `GET {path}` (= `/ota/{job_id}/firmware`, same bearer token) → the image, with
   `Content-Length`, `X-Firmware-Version`, `X-Firmware-SHA256`. Only the device the job belongs to can download it.
2. While downloading/verifying: `POST /ota/{job_id}/progress {"status":"downloading","progress":40}`.
3. Stream into the other OTA partition with `Update`; compare the SHA-256 and size; if they differ
   or `Update.end()` fails → `Update.abort()`, keep running, send event `OTA_REJECTED` and ack the
   command `rejected`.
4. On success: progress `installed`, reboot; the new image stays *pending verify* until it reaches
   the server within 60 s, then marks itself valid and sends `OTA_DONE` (detail = new version);
   otherwise it rolls back and the old firmware sends `OTA_ROLLBACK` after reboot.

## GET /time

`{"epoch_ms":…,"iso":"…"}` — unauthenticated server clock.

## Timing budget against the paper

| Requirement | Mechanism |
|---|---|
| Records every 5 ± 1 s | telemetry POST every 5 s |
| Offline shown within 30 s | server threshold 15 s (configurable 3–30 s per device) |
| FIRE / PANIC in the cloud within 3 s | events POSTed at once |
| Dashboard updates within 3 s | dashboards poll every 1.5 s |
| Settings on the device within 10 s | device polls every 2 s |
| Weather Danger on the device within 10 s | `weather.danger_notice` in every poll |
| Phone alert within 10 s | Telegram sent during the ingest request (4 s timeout) |

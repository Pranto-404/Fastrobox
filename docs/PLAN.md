# FastRobox 1.0 Grand Finale: Master Plan

> **Challenge:** AI-Powered Smart Classroom (Safety, Access and Vision). 12 levels in a fixed order, 500 marks, 7 hours on site, one ESP32-S3-CAM.
> **Companion file:** [`CHECKLIST.md`](CHECKLIST.md) turns every requirement in the question paper into a box to tick, level by level. Use it for rehearsals and for the write-ups.

---

## 0. How we win (read this first)

1. **Most of the work happens before the event.** The rules say *"Code may be written and the platform deployed before the event."* We arrive with all 12 levels built, deployed and rehearsed. On the day, the 7 hours are only for wiring the kit, live judging and recording evidence. We do not write new features on site.
2. **Being reliable beats having more features.** A level fails if both attempts fail, and then **every later level is closed**. A pass on the 1st attempt earns 100% of the marks and a pass on the 2nd earns 70%. We do not go to a live call with a level that has not passed a full rehearsal **3 times in a row**.
3. **The judges follow a fixed script in 3 rounds.** Round A covers L1–3 (about 10 min), Round B covers L4–8 (about 15 min) and Round C covers L9–12 (about 12 min). That is 3 calls, plus 1 spare for a retry (see §1A and §8). We rehearse the judges' exact rows A1–C8 (see [`JUDGING_SCRIPT.md`](JUDGING_SCRIPT.md)). One physical action can count for several levels.
4. **Every result must appear in its fixed place.** Each level lists where each result must show: Serial Monitor, local page, dashboard, light and buzzer, database, phone and BLE. Results from earlier levels must **keep showing** in later levels. Our rehearsals check every one of these places.
5. **Judges choose the test values on the spot.** Wi-Fi, Room ID, class times, limits and the team ID all come from setup or the dashboard. Nothing is hard-coded.
6. **No secrets in the code or the repo.** Device tokens are typed into the setup page. Server keys live in `.env` on the VPS. `gitleaks` runs on every commit and in CI.
7. **No evidence means zero marks.** A level counts only after it is passed live **and** its video, write-up, Git tag and screenshots are uploaded. One person owns evidence full-time on the day, using prepared templates (§9).
8. **The tiebreaker rewards speed.** If scores are equal, the team that passed its last level earlier ranks higher. So we request each call as soon as we are ready.
9. **Every member must be able to explain any part of the code.** Judges can ask anyone, and copied code means disqualification. We hold code walkthroughs every week (§6).
10. **Buy an identical practice kit now.** It should include an ESP32-S3-CAM (8 MB PSRAM), an RC522, a DHT11, a 3-pin IR flame sensor, an active buzzer and jumper wires. We only get the real kit on the day.

---

## 1. Score and risk map

| L | Name | Marks | Marks lost if this level dies (it + all later) | Difficulty | Main risk |
|---|------|------:|------:|-----------|-----------|
| 1 | Dual-core tasks, health, watchdog | 35 | 500 | Low | Watchdog reset reason, sensor-error timing |
| 2 | Wi-Fi setup, secure telemetry | 45 | 465 | Med | Setup-mode vs. reconnect logic, TLS, replay |
| 3 | Heat, fire, panic, fail-safe door | 50 | 420 | Med | Hysteresis + 3 s hold, touch calibration |
| 4 | Secure platform, roles, alerts | 40 | 370 | Med | RBAC on *every* request, Bangla on all labels |
| 5 | Remote settings, OTA, rollback | 30 | 330 | Med-High | Rollback when new FW can't reach server |
| 6 | Weather, history, AI assistant | 40 | 300 | Med | Assistant must never invent data |
| 7 | Card + face check-in | 50 | 260 | High | On-device face detect, < 5 s unlock, attendance rules |
| 8 | Spoofing, lockout, deletion | 30 | 210 | High | Phone-photo spoof must never open |
| 9 | Occupancy, live view, night watch, tamper | 50 | 180 | High | COVERED/MOVED in 6 s, no false fault from walkers |
| 10 | Own-trained hand-raise detector | 40 | 130 | High | Domain shift at venue |
| 11 | Wi-Fi CSI presence + 2×2 localization | 40 | 90 | **Very high** | Data must be collected on site; ≥ 3/4 zones |
| 12 | Offline, BLE, power-cut recovery | 50 | 50 | Med | Exactly-once delivery, original timestamps |

**What this means:**
- L1 to L3 (130 marks) protect the whole run. They must be boring and bulletproof.
- L12 (50 marks, medium difficulty) sits behind L9, L10 and L11, the three hardest levels. Most of L12's machinery (the outbox, flash buffer and exactly-once delivery) is built **in L2**, so L12 costs little extra. L10 and L11 must be robust enough that they **never block L12**.
- Realistic target: L1 to L9 first try is 380 marks. L10 to L12 first try adds 130 more, for 500.

---

## 1A. What the judges will actually do (from the Judges' Checklist)

Each round, the judge does only the rows tagged for the levels we name, in order. A level passes when **all its rows are ticked in the same attempt**. In every call, the judge also asks for **1–2 "Video must show" items live** (spot check). If one fails, that level's attempt fails. The step-by-step script with our prep for each row is in [`JUDGING_SCRIPT.md`](JUDGING_SCRIPT.md).

| Round | Levels | Judge brings | What it means for us |
|---|---|---|---|
| **A** (~10 min) | 1–3 | 2.4 GHz phone hotspot, candle + lighter, extinguisher, stopwatch | **The judge does the Wi-Fi setup** on their own hotspot (A3), using the Room ID they choose and **our device token**, so we hand over the token on paper. They then check the IP **and the mDNS address from our laptop**. A1: 3 taps + 1 held card = **exactly 4 `[CARD]` lines**. A2: `hang` → WATCHDOG and door LOCKED. A4: we show **live DB rows for 20 s** + a replay attempt. A5: Teacher tag while the flame is present does nothing; after it, the student card does nothing and the Teacher tag silences. A6: **unplugged 40 s** → offline/online + BOOT, door still UNLOCKED, then **Reset fire** → LOCKED + Safe. A7: panic 3 s. |
| **B** (~15 min) | 4–8 | Phone camera, two browsers, stopwatch | Judges log in themselves, so logins and URLs go on a printed sheet. B2: **S2 opens S1's attendance URL → 401/403 + no data**. B3: the judge picks a Warning limit between 25 and 35 °C. B4: the **good** OTA file only (damaged and faulty files are spot-check candidates). B5: a TEST Danger notice → banner + purple device, and **removing it clears both**. B6: today's report must include **Round A's fire and panic**. B7–B9: the L7/L8 scenario run **by the judge as Admin** (set class start, re-register the card). The judge shows **a photo of A on their phone for 10 s**. |
| **C** (~12 min) | 9–12 | Two chairs, masking tape, phone, stopwatch, trial-order paper | The device must be **LIVE on our own hotspot**. Chairs go in **seat zones 1 and 2** of the ROOM view, so mark the zones on the floor. C1: capacity 1, counts 0 → 1 (zone 2) → 2 (zone 2 only, the second person standing outside the zones). C3 hand-raise negatives are **"touch head" and "stretch arms sideways"**. C4: lens taped → COVERED + **EMPTY with everyone ≥ 2 m away**. C5: **a judge** walks the 4 zones in random order, 10 s each. C7: our hotspot is turned off for 90 s; after 40 s the judge joins our AP and opens 192.168.4.1; we show a BLE scanner; A taps (let in) and the Teacher tag does not unlock. C8: SYNCING → LIVE, records once each, **A Present at the tap time, flagged face-not-verified**. |

**Things the script forces us to do:**
1. **The judge chooses the Room ID in A3, and it becomes "the room".**
   - The platform **auto-creates a Room** when it sees a new `room_id`.
   - Between Round A and Round B, the Admin assigns that room to the Teacher and builds the L7 classes in it.
   - When we put the device back on our own network after Round A, the setup page **pre-fills the current Room ID and token**, so the room never changes by accident.
2. **`reset` clears only the Wi-Fi details.** The Teacher tag list, fire latch and settings stay.
3. **The Teacher tag must be registered before Round A.**
4. **Map the judge accounts onto the L7 people so one Guardian works for both checks:** **S1 = B, S2 = A**, and the Guardian is linked to S1(B) and D. This satisfies "Guardian linked to S1" (paper) and "Guardian linked to B and D" (checklist). Confirm with the judges.
5. **The L7 set-up before Round B:**
   - A and B are in the class in this room.
   - C is in another class.
   - D is enrolled here but absent.
   - The card is registered to A.

   The "Register card → tap" flow must be simple enough for **a judge** to use.
6. **Board placement and CSI:** the board stays at the ROOM aim for the whole of Round C (no re-aim needed in C1). Collect CSI **after Round B, in that final position, on the same hotspot, without restarting the hotspot** (its channel may change). Record the L9 "turned 45°" video **before** CSI collection.
7. **When a class time changes, push the offline allowlist to the device at once** (C7 sets the class start to "now" just before the hotspot goes off).
8. **Have every video item ready on the table**, because spot checks can ask for any of them: hair dryer + power strip, the three firmware files, a BLE scanner app, the Bangla switch, a weather-outage switch, and a second Teacher browser for the Ack race.

---

## 2. System architecture

```mermaid
flowchart LR
  subgraph Device[ESP32-S3-CAM]
    S[Sensors: DHT11, Flame, RC522, Touch] --> SM[State machine\n(status, fire, panic, door)]
    SM --> SIG[RGB LED + Buzzer]
    CAM[OV2640 camera] --> FD[On-device face detect\n(esp-dl)]
    SM --> OB[(Outbox\nLittleFS log)]
    FD --> NET
    OB --> NET[Net tasks\nHTTPS + cert check]
    CSI[Wi-Fi CSI] --> NET
    LWEB[Local web server\n+ mDNS + setup AP]
    BLE[BLE beacon\n(offline only)]
  end
  NET <-->|HTTPS 443\ntelemetry/events/commands| API
  NET -->|HTTPS JPEG frames, face crops, CSI| API
  subgraph Cloud[VPS: Docker Compose behind Caddy auto-HTTPS]
    API[FastAPI backend\nRBAC on every request] --> DB[(PostgreSQL)]
    API --> ML[ML workers\nInsightFace, anti-spoof,\nYOLO person+pose,\nhand-raise clf, CSI clf]
    API --> WS[WebSocket push]
    SCH[Scheduler\noffline detector, absence marker,\nweather 15 min] --> API
  end
  WS --> UI[React dashboard\nEN/BN, roles]
  API --> TG[Telegram bot\nphone alerts]
  API --> WX[Weather API\n(Open-Meteo)]
  API --> LLM[LLM with tool-use\n(AI assistant)]
```

### 2.1 Technology choices (decide by end of Phase 0)

| Part | Choice | Why |
|------|--------|-----|
| Firmware framework | **PlatformIO + Arduino-ESP32 2.0.17** (`platform = espressif32@6.x`) | The 2.0.x core for S3 ships esp-dl face detection (`human_face_detect_msr01/mnp01`, as in the CameraWebServer example). 3.x dropped it. **Spike S1 must confirm** that CSI callback, NimBLE, TLS and the camera all fit together. Fallback: ESP-IDF 5.x + `esp-dl` + `esp32-camera` components. |
| Device ↔ cloud | **HTTPS only** (keep-alive), server cert checked against the ISRG Root X1/X2 CA (a public CA certificate, so not a secret) | Matches "HTTPS or MQTT over TLS". There is no broker to host or secure, auth is just a Bearer device token, and commands arrive via a 1 s poll. |
| Backend | **Python 3.12 + FastAPI**, SQLAlchemy, Alembic, APScheduler | The ML (face, YOLO, sklearn) lives in the same language. WebSockets are built in. |
| DB | **PostgreSQL 16** | Unique `(device_id, seq)` blocks replays. Atomic `UPDATE … WHERE acked_by IS NULL` handles the Ack race. Good time-range queries. |
| Frontend | **React + Vite + TypeScript + Tailwind + i18next + Recharts** | EN/BN switch, live charts, role-guarded routes. |
| Hosting | One **VPS (4 vCPU / 8 GB)**, Docker Compose, **Caddy** (auto Let's Encrypt) on our own domain | Needs persistent WebSockets, CPU inference and background jobs, which serverless is bad at. |
| Phone alerts | **Telegram bot** (token in server `.env`) | Free, arrives in about 1 s, visible on any phone. |
| Weather | **Open-Meteo** (forecast, no key) + warnings derived from thresholds, labelled "derived". Optional: WeatherAPI.com `alerts=yes` for official alerts (key stays on the server) | The key never reaches the browser. If the service fails, the dashboard shows cached data with its age and "Data stale". |
| Face | Device: esp-dl detector, which crops the face. Server: **InsightFace** (ArcFace embeddings, cosine threshold tuned on our data) + **MiniFASNet (Silent-Face) anti-spoof** + multi-frame liveness | Pre-trained face models are allowed. A hand-raise model is not (see L10). |
| Person / pose | **YOLO (n-size) person detection + YOLO-pose keypoints**, run with ONNX Runtime on CPU | Occupancy, intruder detection, hand-raise features. |
| Own models | **scikit-learn** (LogReg / RandomForest / SVM) for hand-raise (L10) and CSI (L11) | Trains in seconds on site. Training code lives in the repo. |
| AI assistant | **Claude API with tool use** (e.g. `claude-haiku-5-5` or `claude-sonnet-5-5`). It may only call our own read-only query functions. | The answer comes from the same functions as the daily report, so it always matches. Empty result: "no data". |

### 2.2 Repo layout (target)

```
firmware/            PlatformIO project
  platformio.ini     board, PSRAM (qio_opi), partitions, build flags (FW_VERSION, TEAM_ID, SERVER_HOST)
  partitions.csv     nvs | otadata | app0 | app1 | littlefs | coredump
  include/pins.h     board variants (see §4)
  src/               main.cpp, tasks/, net/, storage/, vision/, csi/, ble/
  data/              LittleFS: local status page + setup page (HTML/JS/CSS)
server/              FastAPI app, models, migrations, ml/ (training scripts for L10, L11)
web/                 React dashboard
deploy/              docker-compose.yml, Caddyfile, .env.example (no real values)
tools/               replay.py (L2 demo), make_bad_fw.sh (L5), seed_judges.py (L4), csi/handraise collectors
docs/                PLAN.md, CHECKLIST.md, api.md, wiring.md, writeups/ (templates per level)
evidence/            local only (gitignored): videos, screenshots
```

---

## 3. Device ↔ server contract (freeze this in Phase 1)

All calls are HTTPS with `Authorization: Bearer <device token>`. The token is typed on the setup page, stored in NVS and kept **hashed** in the DB.

| Endpoint | Purpose | Rules |
|---|---|---|
| `POST /api/v1/telemetry` | One fixed-format JSON (§6 of the paper) every 5 ± 1 s | Returns `201` if stored, **`409` if `(device_id, seq)` already exists (replay)**, `401` on a bad token |
| `POST /api/v1/events` | `{device_id, room_id, seq, ts, type, detail}` | Same unique rule. Sent **at once** when created. |
| `GET /api/v1/commands?after=<id>` | Polled every **1 s** on the keep-alive connection. This also acts as the liveness heartbeat. | Commands: `settings`, `reset_fire`, `teacher_tags`, `register_card_mode`, `server_event` (CAMERA_FAULT/OK, PRESENCE, WEATHER_ALERT…), `offline_allowlist`, `camera_position`, `night_mode`, `ota`, `stream on/off`. The device prints `[EVENT] <type> <detail>` for every server event it receives. |
| `POST /api/v1/health` | chip temp, heap, PSRAM, flash, CPU MHz, RSSI, uptime, reset reason, fw | Every 10 s. Feeds the L4 health panel, which matches the `health` command. Kept separate so the fixed telemetry format stays clean. |
| `POST /api/v1/checkin` | Card UID + 1–3 face crops (JPEG) + seq/ts | Returns `{result, reason, name}` synchronously. The total tap→unlock budget is **under 5 s**. |
| `POST /api/v1/frames` | JPEG frames at 2–4 fps while vision is on | **Never written to disk.** Held in RAM only, for live view, counting, camera health and hand-raise. |
| `POST /api/v1/csi` | CSI feature windows (2–5 Hz) | Labelled samples are stored only while recording a dataset. |
| `GET /api/v1/ota/<id>.bin` | Firmware download | Token-protected |

**Telemetry `ts`** is the time of the reading, not the time of sending. **Server events** use a server ID (for example `S-<bigserial>`) in place of `seq`.

**Offline detection:** the device polls every 1 s. A scheduler job runs every 5 s and marks a device offline if `now - last_seen > 15 s`, which is well inside the 30 s limit. It marks the device online again on the next request.

---

## 4. Hardware and pin map (proposed; **verify on day 1 against the board's schematic**)

On typical ESP32-S3-CAM boards (Freenove-style, N8R8/N16R8), the camera uses GPIO 4–13 and 15–18, the onboard WS2812 RGB LED is on **GPIO 48**, BOOT is on **GPIO 0**, and octal PSRAM uses **GPIO 35–37**, so those are off-limits. The touch-capable pins are GPIO 1–14.

| Part | Pin(s) | Notes |
|---|---|---|
| RC522 SCK / MOSI / MISO / SDA(SS) / RST | 47 / 21 / 42 / 41 / 40 | **3.3 V only.** IRQ not used. |
| DHT11 data | 1 | 3.3 V. 10 k pull-up if the module has none. |
| Flame DO | 39 | **Power the module from 3.3 V** so DO never exceeds 3.3 V. Active-LOW on most modules. Tune the potentiometer so a candle triggers at 30–50 cm. Keep it out of sunlight (IR false alarms). |
| Active buzzer (+) | 38 | Driven straight from the GPIO (no transistor in the kit). The other leg goes to GND. |
| Touch panic pad | **14 (T14)** | A short jumper with a bare end. Do not touch it during boot (baseline calibration). On S3 the touch reading **rises** when touched. |
| RGB LED | 48 (onboard) | `neopixelWrite()`; driven only by the signal task |
| BOOT button | 0 (onboard) | Hold 5 s → clear Wi-Fi and enter setup mode |

`include/pins.h` holds **board variants** selected by a build flag. A `selftest` serial command blinks R/G/B, beeps, reads the RC522 version register, reads the DHT, reads flame and prints the touch baseline. That way, if the event kit's board differs, we only need a quick rebuild. Print the pin map, laminate it, and practise wiring from scratch in **under 15 minutes**.

**Partitions:** for 16 MB flash, use nvs 20K, otadata 8K, app0 4M, app1 4M, littlefs ~7.9M and coredump 64K. For 8 MB flash, use app0/app1 3M and littlefs ~1.9M. **Enable OPI PSRAM** (`board_build.arduino.memory_type = qio_opi`).

---

## 5. Level-by-level build notes (the *how*; the full *what* is in CHECKLIST.md)

### L1: Dual-core tasks, health, watchdog (35)
- **Tasks:** every task is pinned explicitly and registered in our own table (name, handle, core, period), which makes the `tasks` command easy. Use `uxTaskGetStackHighWaterMark` for free stack.
  - Core 1 (app): `sensorTask` (DHT11 every 5 s), `flameTask` (100 ms), `rfidTask` (200 ms), `touchTask` (50 ms), `stateTask` (50 ms arbiter), `signalTask` (LED + buzzer patterns, 10 ms), `consoleTask` (= the "main task": serial commands + `[STATUS]` every 1 s), `visionTask`.
  - Core 0 (net): `netTask` (Wi-Fi/AP/mDNS state machine), `syncTask` (outbox → HTTPS, command poll), `mediaTask` (frames/crops/CSI upload), `csiTask`, `bleTask`. The async web server runs on core 0.
- **No blocking waits:** use `vTaskDelayUntil`, queues with timeouts and event groups. There is no `delay()` in logic code.
- **Watchdog:** `esp_task_wdt_init(8 s, panic=true)` and subscribe every task. `hang` → `while(1){}` in consoleTask → restart in about 8 s (< 10 s). Map `esp_reset_reason()`: POWERON→`POWER_ON`, SW→`SOFTWARE`, TASK_WDT/INT_WDT/WDT→`WATCHDOG`, PANIC→`CRASH`, BROWNOUT→`BROWNOUT`. **Verify in Spike S1 that TWDT panic reports as TASK_WDT.**
- **Card once per tap:** report a UID only when it appears after being absent for ≥ 500 ms (track presence; do not rely on `PICC_IsNewCardPresent` alone).
- **Sensor errors:** if the RC522 version register (0x37) reads 0x00 or 0xFF twice in a row (checked every 1 s) → `SENSOR ERROR: RFID` in about 2 s, which is under 3 s. If DHT11 fails 2 reads in a row (at 5 s spacing), the error shows within 10 s, which is under 12 s. Clear automatically on recovery. Everything else keeps running.
- **Start-up:** read the flame sensor *before* setting the door. Flame → `UNLOCKED`.
- `[STATUS]` uses the exact format from §5.1 of the paper. Fields of unbuilt levels print `-`. (We will have everything built, so they are filled in.)
- Use the board's **UART/CH340 port** for Serial (not native USB-CDC) so the monitor survives resets.
- ⚠️ With full firmware and no saved Wi-Fi the light is **blue** (setup mode). For the L1 call, set the device up on our router first so it shows **green**.

### L2: Wi-Fi setup and secure telemetry (45)
- **AP:** `SmartClass-<TeamID>`. The 8-character random password is generated on first boot, **stored in NVS** (L12 reuses it) and printed at start-up. The setup page is at 192.168.4.1 and the light is blue.
- **Setup page:** scan list with RSSI, plus password, **Room ID** and **device token**, all saved to NVS. Mark the credentials `verified=false`.
- **Connect logic (the tricky part):**
  - New, unverified credentials that fail (wrong password, AP not found) → back to setup mode **within 15 s**, with the reason shown on the page (`AUTH_FAIL`, `NO_AP_FOUND`).
  - Credentials that have worked once (`verified=true`) → **never** fall back to setup. Retry with growing gaps (1, 2, 4, 8 s, capped at 8 s so it reconnects within 30 s). This covers power cuts and hotspot drops. Uptime keeps counting.
- **Local page:** HTML/JS stored in LittleFS. It polls `/api/status` every 1 s and shows Room ID, Asia/Dhaka time, T, RH, status, flame, door, last UID, RSSI, chip temp, fw and connection (`LIVE`). mDNS name: `smartclass-<teamid>`.
- **Outbox (build it here; L12 reuses it):** every telemetry record and event is written to an append-only LittleFS log as `[magic][len][payload][crc32]`. `syncTask` sends the oldest first and advances a persisted read pointer only after a `201` or `409`.
- **`seq` never reused:** keep a lease in NVS. At boot, start from the stored `seq_block_end` and write `+100` ahead before using the block. Gaps are allowed; going backwards is not.
- **Time:** NTP (`pool.ntp.org`, TZ `<+06>-6`). If time is unknown, a record stores `(boot_id, uptime_ms)` and is rebased (`ts = sync_epoch − (sync_uptime − record_uptime)`) when time arrives. The local page can also send the browser's time to the device.
- **Replay demo:** `tools/replay.py` resends a captured message → `409` → the DB count is unchanged. It reads the token from an env var.
- **"Newest records" view (A4):** an Admin page that refreshes itself every 1 s and shows the last 20 telemetry rows (all fields), the last events and the total row count. The judge watches this for 20 s, then watches the count stay the same after the replay.
- **mDNS from the laptop (A3):** macOS resolves `.local` names natively. Windows may need Bonjour. Test our laptop on an Android **and** an iPhone hotspot (some hotspots isolate clients).
- **README must explain build + run** from this level on.

### L3: Heat, fire, panic, fail-safe door (50)
- **Status machine with hysteresis + 3 s hold:**
  - Enter WARNING at T ≥ 32 or RH ≥ 85. Enter DANGER at T ≥ 40.
  - Leave DANGER at T ≤ 38 (then re-evaluate Warning). Leave WARNING only at T ≤ 30 **and** RH ≤ 80.
  - A candidate state must hold for 3 s before it commits. Each commit emits one `STATUS old->new` event.
- **Quality:** T outside 0–50 or RH outside 20–90 (or a failed read) → `quality=bad`. Keep the last status and never use the reading. ⚠️ **Hair-dryer tip:** aim for 41–45 °C. Above 50 °C the reading becomes "bad" and Danger will not show.
- **Heat index:** NOAA Rothfusz regression with the low-range Steadman formula. Write the formula in the write-up.
- **Trend:** linear-regression slope over the last 10 readings. A slope above +0.1 °C/reading means RISING; below −0.1 means FALLING. The trend **never** affects light, buzzer or door.
- **Fire:** flame continuous for 2 s → FIRE at once (no 3 s hold). The fire latch is saved in NVS **before** the door is unlocked. Continuous buzzer, 5 Hz red, `FIRE – EVACUATE`. The event goes to the cloud immediately.
- **Silence:** a Teacher tag after the flame is gone → `SILENCED` (buzzer off; the door stays UNLOCKED). A Teacher tag while the flame is present → local page shows `CANNOT SILENCE – FLAME PRESENT`. A student card never silences. **Reset fire** (Teacher/Admin on the dashboard) → `FIRE_CLEARED`, latch cleared.
- **Teacher tag list** is kept in NVS and synced from the server. Register it from the dashboard ("Register teacher tag", then tap).
- **Panic pad:** calibrate the baseline at boot (mean of 50 samples) and print it. Touched means the reading is above baseline × k (tune k). A touch held 2 s → PANIC (red/blue alternating, buzzer 100/100 ms for 10 s). A touch under 1 s is ignored.
- **Signal priority:** a single arbiter picks the lowest-numbered active state from the paper's table (Fire 1 … Safe 11). Only `signalTask` touches the LED or buzzer.

### L4: Secure platform, roles, alerts (40)
- **Auth:** Argon2id hashes and a session in an httpOnly cookie. The lockout counter is per account: 5 consecutive failures → locked for 30 s, during which even the correct password is refused. A `login_history` table records time, user, success/failure and IP, viewable by Admin.
- **RBAC on every API route** (a FastAPI dependency), not only in the UI:
  - Admin: everything.
  - Teacher: own classes and rooms.
  - Student: own attendance.
  - Guardian: linked children only.
  - Otherwise return 403 **with no data**. Test this with `tools/rbac_test.py`, which hits every route with every role.
- **Live dashboard:** a WebSocket pushes each ingested record. Target under 2 s (limit 3 s). Show a red FIRE/PANIC banner on every logged-in page, plus the Reset fire button.
- **Health panel:** fed by `/api/v1/health`, with the same fields as the `health` command and a "last seen" time.
- **Phone alerts:** FIRE, PANIC and DANGER trigger a Telegram message to the Teacher within 10 s. Log each sent alert in the DB with its time.
- **EN/BN:** i18next JSON for **every** menu, label, button and state name, with the Noto Sans Bengali font. A CI check fails the build if any key is missing in `bn.json`.
- `tools/seed_judges.py` creates Admin, Teacher, S1, S2 and Guardian (linked to S1), using passwords typed in at the prompt (never stored in the repo).
- **Per-student attendance URL** (`/students/<id>/attendance`). B2 has S2 open S1's URL directly. The API answers **403 with an empty body**, and the page shows "Not allowed".
- **Room auto-registration:** an unknown `room_id` in telemetry creates a Room. Admin assigns its Teacher with one click (needed after A3).

### L5: Remote settings, OTA, rollback (30)
- **Settings page (Admin only):** Warning and Danger limits. Validation: values must be in 0–50 and Warning must be below Danger. "Warning 45" with Danger 40 is refused with a clear message. Keep a change log (who, when, old → new). The device gets the settings via a command (≤ 1 s poll), applies them, saves them to NVS and sends `SETTINGS_APPLIED warn=.. danger=..`. The local page shows the limits.
- **OTA:**
  1. Admin uploads a `.bin`. The server stores it with its SHA-256, size and version (parsed from the image's app descriptor).
  2. The server sends an `ota` command. The device downloads it over HTTPS in chunks into the other partition, printing `[OTA] 35%…`.
  3. The device checks size, SHA-256 and ESP image validation (`esp_ota_end` checks the image's built-in hash, so **a file cut in half fails**) → `OTA_REJECTED`, and it keeps running the old firmware.
- **Rollback at app level (does not depend on bootloader config):**
  - Before rebooting, the old firmware saves `pending_verify=1, prev_partition` and a boot counter in NVS.
  - The new firmware must reach the server within 60 s → `mark_valid` + `OTA_DONE`.
  - Otherwise, or after 3 crash-boots, it sets the boot partition back to the previous one and restarts → `OTA_ROLLBACK`.
  - Settings, Wi-Fi and the fire latch are in NVS, so they survive. Also enable `esp_ota_mark_app_valid_cancel_rollback()` if the bootloader supports it.
- `tools/make_test_fw.sh` builds three files:
  1. `fw-1.0.1-good.bin`
  2. `fw-1.0.1-damaged.bin` (truncated with `head -c`)
  3. `fw-1.0.2-badserver.bin` (built with `SERVER_HOST=wrong.example.invalid`)
- Keep the firmware small enough that OTA plus reboot takes well under 3 minutes.
- **Do not reject an image only because its version is not newer.** A spot check may come *after* B4 has installed 1.0.1, so integrity checks alone decide. Bring spare files: `1.0.1-good`, `1.0.1-damaged`, `1.0.2-badserver` and `1.0.3-good` (for a repeat).
- B3 Warning values between 25 and 35 °C may push the room straight into Warning (yellow). That is expected. After Round B, set Warning back to 32 °C.

### L6 addition
- **Removing a notice must clear it everywhere:** send a `server_event WEATHER_CLEARED` command so the device leaves purple and the local page drops `WEATHER ALERT` (B5).

### L6: Weather, history, AI assistant (40)
- **Weather:** a scheduler fetches every 15 min and caches the result in the DB with its fetch time. The dashboard reads only from the cache. On failure it shows the last data, its age and `Data stale`. Admin has a "simulate weather outage" switch for the video.
- **Notices:** official alerts if available, otherwise derived ones with a "derived from forecast" label:
  - heatwave: heat index ≥ 40 °C
  - heavy rain: ≥ 44 mm/24 h
  - storm: gusts ≥ 62 km/h
  - cyclone: gusts ≥ 89 km/h

  Each has a severity of Advisory, Warning or Danger. Admin can add or remove a TEST notice.
- **Danger notice:** a WebSocket banner on all dashboards, plus a `server_event WEATHER_ALERT` command to every device (≤ 1 s poll). The device shows purple, beeps 3 times and shows `WEATHER ALERT <text>`. Target under 3 s (limit 10 s).
- **History:** chart (≤ 24 h, minute-averaged), event filter (type + time range), daily report (min/max/avg T and RH, alarm counts by type, attendance totals) and CSV export of all three. All of them use **the same SQL functions**.
- **Assistant:** the LLM gets *only* tools such as `daily_report(room, date)`, `readings_stats(room, from, to)`, `count_events(room, type, from, to)` and `attendance(room, date)`, limited to the Teacher's rooms. The system prompt says: answer only from tool results; if empty, say "no data". It answers in the language of the question (EN/BN). Students and Guardians get 403 on history, report and assistant.

### L7: Card + face check-in (50)
- **Enrolment:** show a consent notice and capture ≥ 3 images. **Tip: capture enrolment images with the device camera at DOOR** (dashboard → "capture from device") so they match the real camera. Compute embeddings, **delete the photos at once**, and store embeddings only.
- **Card link:** Admin clicks "Register card" and the next tap is linked. Admin can remove or change the link. ⚠️ **The kit has only 1 card + 1 key tag**, so the scenarios with students A, B, C and D are run by **re-linking the single card** quickly on the dashboard. Practise this.
- **Device flow on tap:**
  1. If camera position is ROOM → deny `CAMERA NOT AT DOOR`. If there is a camera fault → deny `CAMERA FAULT`. (Do these *before* face detection, or a covered lens would wrongly give NO FACE.)
  2. Run face detection on QVGA frames for up to 3 s. No face → local `NO FACE` (3 red flashes, 2 beeps), without asking the server.
  3. Crop the face with a 30% margin, encode it as JPEG, and POST it with the UID. Print `[CAM] FACE w= h=`.
- **Server order of checks:** unknown card → `UNKNOWN CARD`; card blocked → `CARD BLOCKED`; no class now in this room → `NO CLASS NOW`; not enrolled → `NOT IN THIS CLASS`; spoof → (L8); face ≠ owner → (L8); otherwise GRANTED (solid green 5 s, one beep, door UNLOCKED 5 s).
- **Attendance:** one record per student per class. Present if within 10 min of the start, Late after that. A scheduler job runs every 10 s and also **immediately when a class time is edited** (the "start set to 31 min ago" test), marking enrolled students with no check-in after 30 min as Absent. A repeat check-in opens the door but adds no record. The linked Guardian gets an in-platform notification (plus optional Telegram) within 60 s of a Late or Absent mark.
- The dashboard log of received images shows only the size in pixels; the images are not kept.

### L8: Spoofing, lockout, deletion (30)
- **Face mismatch:** cosine similarity below threshold → `FACE_MISMATCH`, deny, store a private snapshot (Teacher/Admin only, served through an authenticated endpoint; a Student gets 403) and alert the Teacher (WebSocket + Telegram) within 10 s. **Never fall back to the card alone.**
- **Photo spoof (layered):**
  1. MiniFASNet anti-spoof score.
  2. The device sends 3 crops about 300 ms apart, and the server requires natural small motion between them and no frozen frame.
  3. A screen check: moiré/FFT high-frequency energy and specular glare.

  Any failure → `SPOOF`, deny. Tune for **zero false accepts** first, then keep real-face rejections under 10%.
- **Lockout:** 3 `FACE_MISMATCH` on the same card within 2 min → blocked for 5 min (`CARD BLOCKED`, even for the owner). Admin can unblock.
- **Ack:** `UPDATE alerts SET acked_by=?, acked_at=now() WHERE id=? AND acked_by IS NULL RETURNING …`. If 0 rows come back, reply "already acknowledged by X at T". Add an `ACK` event.
- **Delete student:** in one transaction, delete embeddings, card link and snapshot files, and add an audit row plus `STUDENT_DELETED`.

### L9: Occupancy, live view, night watch, tamper (50)
- **Positions:** Admin saves DOOR and ROOM reference snapshots (kept). Teacher selects the position → device prints `[CAM] position=…`.
- **Frames:** the device streams VGA/QVGA JPEG at 3–4 fps (≥ 2 required; aim for ≥ 25 updates in 10 s). The server runs YOLO person detection. Browsers get frame + boxes over WebSocket (Teacher/Admin only). Frames are **never stored**.
- **Zones:** Admin draws ≥ 2 polygons on the ROOM snapshot. A zone is occupied if a person's box centre is inside it. The count and seat map change only after holding 3 s, so updates appear in about 4 s (limit 6 s). Emit `OCCUPANCY` (counts only).
- **Capacity:** count above capacity for 3 s → `OVER_CAPACITY` (dashboard + local page).
- **Night mode:** a person seen for 3 s → `INTRUDER`. Store one snapshot and alert Admin within 10 s (WebSocket + Telegram). The local page shows INTRUDER.
- **Camera health (scores shown live):**
  - COVERED: mean brightness < T1 **or** Laplacian variance < T2 (near-uniform image).
  - MOVED: ORB feature match against the reference of the selected position, with low homography inlier ratio < T3. **Mask out person boxes** and require 3 consecutive bad frames at 1 Hz, so walkers never cause a fault.
  - Fault → `CAMERA_FAULT` event + snapshot alert within 10 s + server_event to the device (cyan, local `CAMERA FAULT: <state>`, check-ins denied). Recovery → `CAMERA_OK` within 6 s.
- Tune T1, T2 and T3 on recordings from 3 different rooms and lighting conditions, and document them.
- **C1 exact sequence:** empty → `0 / none`; one person sitting in zone 2 → `1 / zone 2`; a second person standing in view outside the zones → `2 / zone 2 only` + `OVER CAPACITY` (capacity 1), which clears when they leave.
  - Draw the zones tight around the chairs.
  - Mark zones 1 and 2 on the floor with tape so the judges put their chairs there.
  - Empty chairs must never count as people (person class only, confidence ≥ 0.5).
- **C2:** at least 20 updates in 10 s, with the box following a person walking. Stream at 4 fps so we have a margin.

### L10: Own-trained hand-raise detector (40)
- **Data tool:** at ROOM, a dashboard "Collect" mode saves seat-zone crops labelled `raised` or `not` (these are training images, so storing them is fine). Goal: ≥ 150 per class in prep, plus a **20–40 per class top-up at the venue** for its lighting.
- **Features:** YOLO-pose keypoints of the person in the zone, made scale-invariant: wrist y relative to shoulder and nose, elbow angle, arm length. Fallback: MobileNet embeddings of the crop.
- **Classifier (ours):** LogisticRegression or GradientBoosting from `server/ml/handraise/train.py`. Use a fixed **≥ 20% held-out set, split by recording session** (not random frames).
- **Model page:** image counts, held-out accuracy, confusion matrix, average ms per prediction.
- **Runtime:** positive for ≥ 2 s (consecutive frames) → `HAND RAISED – Seat n` once. Re-arm only after the hand goes down. The page shows today's count per seat.
- ⚠️ **The judges' negatives are "touch head" and "stretch arms sideways".** With "touch head" the wrist is *above the shoulder*, so a simple "wrist above shoulder" rule fails. The "not raised" class must contain **many examples of exactly these two poses**, plus sitting still, phone use, and leaning. Useful features: elbow above shoulder, a nearly straight arm, wrist above the **top of the head**, and the wrist-to-nose distance. The judge picks a random order of 4 trials, with **3 s raises**, in seat 1 or 2.

### L11: Wi-Fi CSI presence + 2×2 localization (40)
- **Capture:** `esp_wifi_set_csi_config/rx_cb` on the STA link to **our own pocket router**, fixed on 2.4 GHz HT20 on a fixed channel. Ping the gateway at 50 Hz to get ≥ 20 CSI packets/s (aim for 40+). `csi` command → packets/s, subcarriers, channel.
- **Features (on device, 0.5 s windows):** per-subcarrier amplitude mean and std (about 52 subcarriers, normalised), plus total motion variance. Send at 2 Hz.
- **Presence:** classifier EMPTY vs OCCUPIED plus motion variance, with a 3 s hold → `PRESENCE` event (server → device → `[EVENT] PRESENCE …`).
- **Localization:** RandomForest/SVM on the features, with a majority vote over the last 3 predictions. The map updates in under 3 s.
- **On-site protocol (practise until it takes under 20 minutes):**
  1. Fix the board and router at **opposite corners** of the grid, so each zone cuts a different path. Tape their positions.
  2. Cover the lens.
  3. Record EMPTY 90 s, then each zone 90 s (the person shifts a little within the zone), then repeat a second round.
  4. Hold out the 2nd round (≥ 20%).
  5. Train (a few seconds).
  6. Check the confusion matrix.
- ⚠️ The board **must not move** between data collection and the L11 test. See the call plan (§8).
- **What the judges test (C4/C5):**
  - Everyone stands ≥ 2 m away outside the grid and keeps still → EMPTY within 5 s, **staying EMPTY for 10 s**.
  - **A judge** (not one of us) walks into the zones in random order, 10 s each. The zone shown at the end of the 10 s counts. OCCUPIED within 5 s; map within 3 s.
  - The judge walks out ≥ 3 m → EMPTY within 5 s.
- **What that means for training:**
  - Record EMPTY with people **standing and moving 2–3 m outside the grid** (the judges and our team will be there).
  - Record each zone with **at least 2 different team members**, standing *still* as well as shifting. A still person must stay OCCUPIED.
  - Presence must therefore use the deviation from the empty baseline, not only motion variance.
  - Keep the 3 s hold and a short vote window, so decisions land at about 4 s (limit 5 s).
- **AP:** use the same hotspot that Round C and C7 use (Round C requires our own hotspot). Place it on a stand and tape it down. Do not toggle it between CSI collection and C5.
- **Practise in at least 3 different rooms** before the event. Accuracy in one room means nothing.

### L12: Offline, BLE, power-cut recovery (50)
- **Connection state:** `LIVE → OFFLINE → SYNCING n=<k> → LIVE` on Serial, the local page and the dashboard. The light shows a blue heartbeat while not LIVE (unless a higher-priority state applies).
- **Offline entry:** while online, the server pushes `offline_allowlist` (card UIDs of the class running now + its window) → NVS. While offline, a listed card gets the granted pattern + `OFFLINE_ENTRY` (face not verified, tap time). Any other card or tag is denied.
- **AP after 30 s down:** AP+STA mode `SmartClass-<TeamID>` with the same NVS password. The local page shows the records-waiting count. `[NET] AP ON`.
- **BLE:** NimBLE advertises `SC-<TeamID>-<STATE>` while offline. Restart the advert on each state change. `[BLE] advertising …`.
- **Buffer:** the L2 outbox. 30 min of telemetry is about 360 records × ~300 B, roughly 110 KB, which is easy. Records are sent oldest first, once each (the server's `409` counts as delivered). On boot, any tail record with a bad CRC or length is **truncated** (half-written record discarded).
- **Original time across a power cut:** records keep the real `ts` if time was known. Otherwise they keep `(boot_id, uptime)` and are rebased when NTP or browser time arrives.
- **AP + STA on one channel:** while the AP fallback is up, phone clients must not keep dropping off. Reconnect the STA with the saved **BSSID + channel** (no full scans), at most once every 10 s.
- **C7 sequence to rehearse:**
  1. Admin sets class start = now (the allowlist is pushed at once).
  2. Hotspot off.
  3. At about 30 s, `[NET] AP ON`.
  4. At 40 s, the judge's phone joins and opens 192.168.4.1, where the waiting count is rising.
  5. The BLE scanner shows `SC-<TeamID>-OFFLINE`.
  6. A taps → green + `OFFLINE_ENTRY`.
  7. The Teacher tag → denied (the tag only silences fire; it never opens the door offline).
  8. Hotspot on at 90 s → `SYNCING n=…` → `LIVE` within 60 s.
  9. A is Present at the tap time, flagged face-not-verified.
- **Restore on boot:** door, fire latch, settings, Room ID and Teacher tags all come from NVS. The device sends `BOOT` + state within seconds, so light, local page, door and dashboard agree within 20 s.

---

## 6. Preparation schedule (before the event)

We don't yet know how many days are left. The plan below is in **phases** (about 3 weeks at full pace). If time is shorter, **cut from the end (L11, then L10), never from L1 to L3 quality.**

| Phase | Days | Goal | Exit criteria |
|---|---|---|---|
| **0. Setup + spikes** | 1–3 | Repo structure, VPS + domain + Caddy + CI (lint, tests, gitleaks), practice kit wired. **Spikes:** S1 camera + esp-dl face detect + TLS + NimBLE + CSI together in one firmware (heap/PSRAM check, TWDT reset reason); S2 CSI ≥ 20 pkt/s; S3 InsightFace + MiniFASNet accuracy on our faces through the ESP32 camera; S4 OTA + app-level rollback | All four spikes green, or a fallback chosen |
| **1. Device foundation** | 3–6 | L1, L2 (device + ingest API + DB), L3 | Full L1–L3 checklist passes 3× in a row |
| **2. Platform** | 5–10 | L4, L5, L6 (frontend + backend; firmware for settings/OTA in parallel) | L4–L6 checklists pass; RBAC test suite green |
| **3. Access** | 8–13 | L7, L8 | Unlock < 4 s measured over 20 taps; spoof false accepts = 0 over 30 tries with 3 phones |
| **4. Vision** | 11–16 | L9, L10 (start collecting hand-raise data on day 11) | COVERED/MOVED/OK < 5 s; held-out hand-raise accuracy ≥ 95% |
| **5. Radio + resilience** | 13–18 | L11 (practise in 3 rooms), L12 | ≥ 3/4 zones in each room; 30-min offline soak, exactly-once verified by SQL |
| **6. Dress rehearsals** | 18–21 | **Three full 7-hour mock events** that follow `JUDGING_SCRIPT.md` row by row, with spot checks: rewire from scratch, a "judge" teammate picks random test values, record real evidence, time everything. 12-hour soak test of the firmware (memory leaks, heap). Freeze the code 24 h before the event. | Every level passes first try in the last 2 rehearsals |

### Roles (4 people; merge roles if 3)

| Role | Owns | Also |
|---|---|---|
| **A: Firmware core** | L1, L2 device side, L3, L12, OTA client | Pin map, wiring practice |
| **B: Firmware vision/radio** | Camera, on-device face detect, frame streaming, CSI, BLE | L11 data protocol |
| **C: Backend + ML** | API, DB, RBAC, face recognition, anti-spoof, YOLO, hand-raise + CSI training, assistant, scheduler | VPS / DevOps |
| **D: Frontend + Evidence lead** | Dashboard, i18n, charts, Model pages | Video scripts, write-up templates, test tables, on-site evidence capture and upload |

**Weekly code walkthrough (1 h):** each person explains one module to the others. Before the event, every member must be able to explain every module (judges can ask anyone).

**Git discipline:**
- Feature branches → PR → `main`.
- Conventional commits.
- One tag per level, `level-NN`, on **the exact commit that is flashed and deployed for that level's live test** (create it on site and push it right after the call).
- Keep the README current from L2 on.
- Never rewrite history (judges inspect it).

---

## 7. Event-day runbook (7 hours)

| Time | Who | What |
|---|---|---|
| 0:00–0:20 | A+B | Unpack and check the kit. Wire from the laminated pin map. Flash the release build + LittleFS image (`tools/flash_all.sh`). Run `selftest`. **Register the Teacher tag.** |
| 0:00–0:20 | C+D | Check the VPS is up, check our hotspot, check the judges' accounts exist. Print the **judge sheet**: logins, page URLs, the device token, the AP name. Open the laptop windows in their fixed layout (Serial Monitor · local page · dashboard · "newest records" page · big on-screen clock). |
| 0:20–0:40 | all | **Record the L1–L3 video items** (sensor unplug, hair dryer, candle flick, short touch, gentle warming, DHT unplugged in Warning). This doubles as a final check. Put the hair dryer, power strip and extinguisher on the table. |
| ~0:40 | all | **Call 1 = Round A (L1–L3)**, about 10 min |
| after A | A+C | Put the device back on our hotspot with the **same Room ID** the judge chose. Admin: assign the room to the Teacher; set up the L7 scenario in that room (A and B in this class, C in another class, D enrolled but absent, card → A, Guardian → B and D). Re-aim the camera to **DOOR**. Check the 3 firmware files are on the laptop. |
| after A | D | Fill in the L1–L3 write-ups (screenshots + measured values). `git tag level-01..03` + push. Upload. |
| ~1:00–1:40 | all | **Record the L4–L8 video items** (four roles, Bangla, lockout, settings + OTA damaged/faulty, weather outage, chart/history/CSV, assistant "no data", L7/L8 scenarios, Ack race, delete C) |
| ~1:45 | all | **Call 2 = Round B (L4–L8)**, about 15 min. Afterwards: Warning limit back to 32 °C. |
| 2:00–2:30 | B | Record the L9 videos that **move the board** (45° MOVED, covered at DOOR → CAMERA FAULT, tap at ROOM → CAMERA NOT AT DOOR), plus Night-mode INTRUDER. |
| 2:30–2:45 | B | **Final placement:** aim at ROOM and tape the board. Tape seat zones 1 and 2 on the floor. Tape the hotspot phone or router in place. Draw the zones on the ROOM snapshot. **Nothing moves after this point.** |
| 2:45–3:15 | B+C | Hand-raise top-up at the venue (include "touch head" and "stretch arms sideways" negatives) → retrain → Model page. CSI collection (EMPTY with people 2–3 m away + 4 zones × 2 people × 2 rounds) → train → confusion matrix. Record the L10 and L11 videos. |
| ~3:20 | all | **Call 3 = Round C (L9–L12)**, about 12 min |
| after C | A | Record the L12 videos (power cut during an outage; two power cuts with fire latched) |
| ~4:00–end | D (+all) | Finish all write-ups, push tags, upload `T##_L##_video.mp4` + `T##_L##_writeup.pdf` (≤ 30 min after judging closes). **Call 4 is kept in reserve** for a 2nd attempt. |

Judges serve many teams, so **request each call early** and prepare the next round while waiting in the queue.

---

## 8. Judging-call strategy

- **Plan:** Call 1 = Round A (L1–L3), Call 2 = Round B (L4–L8), Call 3 = Round C (L9–L12), **Call 4 = spare.**
- **If a level fails:** if the cause is obvious and fixable within about 2 minutes (a loose wire, a wrong setting), take the 2nd attempt **straight away** in the same call. Otherwise stop, fix it calmly, and start the next call with that level. The spare call exists for exactly this.
- **Spot checks:** expect 1–2 "Video must show" items to be repeated live in every call, and they decide that level's attempt. Every video item must be **as reliable as a live row** and quick to set up (props on the table).
- **Speed (tiebreaker):** the judges' sheet records the time of the last level passed. Request Round C as early as the CSI and hand-raise prep allows.
- **Timing:** a time no more than 0.5 s over a limit is re-measured, but we aim for **half of every limit**. Show the measured timings on screen (the dashboard shows the event time vs. the device time).

---

## 9. Evidence production

- **Video:** a phone on a tripod (1080p), with the laptop showing Serial Monitor + local page + dashboard side by side and a **large stopwatch page** in frame. Open with: "Team T##, Level NN". At most 10 min per level, up to 3 **unedited** clips. Have a **shot list for every level** (from CHECKLIST.md "Video must show") taped next to the laptop.
- **Write-up (≤ 2 pages):** pre-written templates in `docs/writeups/LNN.md` with the five headings (Design + diagram · Where it shows · Test results table · Problems and fixes · Extra item). On site, paste screenshots and measured values. Export to PDF with pandoc (`tools/writeup.sh NN`).
- **Code:** `git tag level-NN <commit>` + push. Put the hash in the write-up.
- **Naming:** `<TeamID>_L<NN>_video.mp4`, `<TeamID>_L<NN>_writeup.pdf`.
- **Never let evidence contradict what the judge saw.** Use the same build, the same values and the same day.

---

## 10. Risk register

| # | Risk | Prevention / fallback |
|---|---|---|
| 1 | The event board differs from our practice board (pins, LED, flash/PSRAM) | Board variants in `pins.h`, `selftest`, a 2nd prebuilt binary per variant |
| 2 | Venue Wi-Fi is crowded, or the judge's hotspot has weak internet | Our own pocket router with 4G backup; small payloads; the outbox absorbs gaps |
| 3 | VPS or backend failure on the day | Docker `restart: always`, health check + uptime alert to Telegram, nightly DB backup, a tested restore procedure, a spare VPS snapshot |
| 4 | Faces not recognised under venue light | Enrol with the device camera on site; tune the threshold; good front light on the DOOR position |
| 5 | Anti-spoof rejects real faces | Layered checks, tuned on 3+ phones and 3+ lighting setups; measure false-reject and false-accept rates for the write-up |
| 6 | CSI accuracy collapses at the venue | Collect on site, opposite-corner placement, practise in 3+ rooms, session-based holdout |
| 7 | Hand-raise domain shift | Pose-keypoint features (lighting-robust) + venue top-up + quick retrain |
| 8 | Heap fragmentation or a crash after hours | Large buffers in PSRAM, 12 h soak test, watchdog, heap shown in `[STATUS]` |
| 9 | USB brownout (camera + Wi-Fi + BLE peaks) | Good USB port/cable, lower camera clock if needed, `BROWNOUT` reason shown |
| 10 | Secret leaked in Git | gitleaks pre-commit + CI; `.env.example` only; rotate any leaked key at once |
| 11 | Long queue for a judging call | Request early; do the next level's video recording while waiting |
| 12 | A member can't explain some code | Weekly walkthroughs; each module has an owner and a backup |
| 13 | Only one RFID card in the kit | Fast card re-link flow on the dashboard; scripted A/B/C/D sequences |
| 14 | The judge's Room ID (A3) does not match the rooms on the platform | Auto-create the room; setup page pre-fills the current Room ID; between-round checklist assigns the Teacher and classes |
| 15 | mDNS address not reachable from our laptop on the judge's hotspot | Test on Android and iPhone hotspots with our laptop OS; Bonjour on Windows; use a Mac as the demo laptop if possible |
| 16 | Phone clients drop from the fallback AP while the STA retries (C7) | Reconnect on a fixed BSSID + channel, no full scans, ≥ 10 s between attempts |
| 17 | Our hotspot changes channel, so the CSI model goes stale | Don't toggle the hotspot between CSI collection and C5; fix the channel if it's a router |
| 18 | Hand-raise false positives on "touch head" / "stretch arms" | These exact poses in the negative class; test 4-trial random orders in rehearsals |
| 19 | Phone-photo spoof unlocks the door (B9) | Layered anti-spoof; 30+ attempts with 3+ phones in rehearsal, zero accepts allowed |

---

## 11. Questions to ask organisers at the briefing

1. May one final firmware/platform build be used for the tests of earlier levels, with several `level-NN` tags on the same commit?
2. Must videos be recorded on site (we assume yes), and may they be recorded before that level's live call?
3. Does `FIRE_CLEARED` mean "flame gone" or "Reset fire pressed"? (We plan to send it on Reset fire, with the flame-gone time in the detail.)
4. What is our Team ID and expected device ID format (e.g. `T07-D1`)?
5. ~~Do the judges' hotspots have internet?~~ Round A uses the judge's 2.4 GHz phone hotspot, which we assume has internet. Round C uses **our own** hotspot. Is our own hotspot fine for Round B too?
6. ~~When will the L11 grid be marked?~~ Before the clock starts. May CSI data collection happen at any time before Round C?
8. Is mapping the judges' accounts **S1 = B and S2 = A** (the Guardian linked to S1/B and D) acceptable?
9. Will the judges bring the photo of A, or should we provide one?
7. Where is the submission folder, and when exactly does "judging close"?

---

## 12. Definition of done (per level)

A level is "done" in prep when **all** of these are true:

- [ ] Every item in its section of `CHECKLIST.md` passes on the practice kit, 3 runs in a row, with judge-style random values.
- [ ] All earlier levels still pass (regression run).
- [ ] The write-up template is filled except for screenshots and measured values.
- [ ] The video shot list has been rehearsed once with the real camera setup.
- [ ] Every team member can explain how it works.

# FastRobox 1.0: Requirement Checklist

Every requirement in the question paper, as a box to tick. Use it for every rehearsal (judge-style **random values**: a different Wi-Fi, Room ID, class times and limits each time) and to fill each write-up's *Test results* table.

Legend: **[LIVE]** = judged live · **[VIDEO]** = must be in the video (the judge may ask for it live) · **[WRITE-UP]** = must be in the write-up.

## Global (all levels)

- [ ] Serial is 115200 baud. Every line starts with a tag: `[STATUS] [CARD] [EVENT] [ERROR] [NET] [OTA] [CAM] [BLE] [CMD]`
- [ ] `[STATUS]` every 1 s, in this exact order and format:
  `[STATUS] up=742s T=29.0C RH=64% HI=31.2C flame=0 door=LOCKED state=SAFE trend=STABLE rssi=-61 heap=182k psram=7104k chip=41.5C fw=1.0.0`
- [ ] Serial commands reply with `[CMD]`: `help status health tasks ver hang reset csi`
- [ ] Every event sent **or received** is printed as `[EVENT] <type> <detail>`
- [ ] Telemetry JSON has exactly the fixed fields, sent every 5 ± 1 s: `device_id room_id seq ts uptime_s temp_c rh heat_index_c flame door status heat_trend rssi heap_kb chip_temp_c fw quality`
- [ ] Events carry `device_id room_id seq ts type detail` (server events carry a server ID in place of `seq`)
- [ ] `(device_id, seq)` is unique in the DB; a duplicate is never stored
- [ ] Local page updates itself at least every 2 s. The dashboard updates itself without a page reload.
- [ ] Light priority: the lower state number wins (1 Fire … 11 Safe)
- [ ] Results from earlier levels still show in the later levels
- [ ] No password, key or token in the firmware, website code or repo (gitleaks clean)
- [ ] The door state (`LOCKED`/`UNLOCKED`) shows on the light, the local page and the dashboard

### Device signals

| # | State | LED | Buzzer | ✔ |
|---|---|---|---|---|
| 1 | Fire | Red, 5 Hz flashing | 200/200 ms continuous | [ ] |
| 2 | Panic | Red/blue alternating | 100/100 ms for 10 s | [ ] |
| 3 | Access granted | Solid green 5 s | 1 short beep | [ ] |
| 4 | Access denied | 3 quick red flashes | 2 short beeps | [ ] |
| 5 | Heat Danger | Red 2 Hz heartbeat | short beep every 2 s | [ ] |
| 6 | Sensor error | Magenta 2 Hz | — | [ ] |
| 7 | Camera fault | Cyan 2 Hz | — | [ ] |
| 8 | Weather Danger | Purple 2 Hz | 3 beeps once on arrival | [ ] |
| 9 | Warning | Yellow 2 Hz | — | [ ] |
| 10 | Wi-Fi setup / offline | Blue 2 Hz | — | [ ] |
| 11 | Safe | Green 2 Hz | — | [ ] |

---

## L1: Dual-Core Tasks, Health and Watchdog (35)

- [ ] FreeRTOS tasks on **both** cores; no blocking waits
- [ ] LED blinks at 2 Hz (250 ms on / 250 ms off) in the state colour
- [ ] DHT11 read every 5 s, flame every 100 ms, RFID every 200 ms
- [ ] A card is reported once per tap, even when held on the reader
- [ ] `[STATUS]` every 1 s, including chip temp, free heap and free PSRAM
- [ ] Commands `help`, `status`, `health`, `tasks`, `ver`, `hang` work
- [ ] Task watchdog: a freeze leads to a self-restart within 10 s
- [ ] Boot prints `[EVENT] BOOT reason=POWER_ON|SOFTWARE|WATCHDOG|CRASH|BROWNOUT`
- [ ] Start-up: flame checked first (no flame → LOCKED; flame → UNLOCKED)
- [ ] `[ERROR] SENSOR ERROR: <name>` → magenta, everything else keeps running. DHT11 within 12 s, RFID within 3 s. Clears by itself.
- [ ] **[LIVE]** steady 2 Hz light · one `[CARD]` line per tap · `health` and `tasks` · watchdog restart within 10 s
- [ ] **[VIDEO]** DHT11 data wire + RC522 SDA unplugged for 15 s: RFID error ≤ 3 s, DHT11 error ≤ 12 s, magenta, no freeze; both clear after reconnecting
- [ ] **[WRITE-UP]** wiring diagram (every pin) · task diagram (task, core, period) · `[STATUS]` every second in the fixed format · read periods 5 s / 100 ms / 200 ms · flame at start-up gives UNLOCKED

## L2: Wi-Fi Setup and Secure Telemetry (45)

- [ ] No saved network → AP `SmartClass-<TeamID>`, 8-char password printed on Serial at start-up, setup page at 192.168.4.1, blue light
- [ ] Setup page: network scan with signal strength, plus password, **Room ID** and **device token** fields. Saved in NVS.
- [ ] Local status page at its IP and at `http://smartclass-<teamid>.local`. Files in LittleFS. Updates ≤ 2 s. Shows Room ID, local time (Asia/Dhaka), temperature, humidity, status, flame, door, last card UID, RSSI, chip temp, fw and connection state (`LIVE`).
- [ ] Wi-Fi drop → reconnects by itself (increasing gaps), no restart. Power cut → reconnects with no setup.
- [ ] Wrong password / unreachable network → back in setup mode within 15 s, with the error shown on the setup page
- [ ] BOOT held 5 s while running, or `reset` → saved details cleared
- [ ] Level 1 keeps running during every connection attempt
- [ ] Telemetry every 5 ± 1 s over HTTPS (server certificate checked) with the device token. `CARD_TAP` sent at once. `BOOT` event with reset reason.
- [ ] NTP time in `ts`. `seq` increases and is never reused, even after a restart.
- [ ] Replay (same `seq`) rejected by the server
- [ ] Platform marks the device offline within 30 s of silence and online when it returns. Device reconnects by itself after a backend restart.
- [ ] README explains how to build and run the firmware and the platform
- [ ] Serial: AP password · `[NET]` connecting / IP / mDNS name / disconnect / reconnect / setup error · `[NET]` server connect / disconnect / reconnect
- [ ] DB: telemetry every 5 ± 1 s with all fields · `CARD_TAP` and `BOOT` events · online/offline state
- [ ] **[LIVE]** setup on the judge's hotspot · both page addresses · records every 5 ± 1 s · replay rejected · offline within 30 s · reconnect with no setup after a power cut
- [ ] **[VIDEO]** hotspot off 20 s → reconnects within 30 s, no restart (uptime keeps counting)
- [ ] **[VIDEO]** BOOT held 5 s → AP returns. Wrong hotspot password → setup mode within 15 s and the page shows an error.
- [ ] **[VIDEO]** backend stopped 20 s → records resume within 30 s, no device reset
- [ ] **[WRITE-UP]** how setup saves details · reconnection strategy · mDNS name · system architecture diagram (device, server, DB, AI services, weather, dashboard) · how replays are rejected · HTTPS with cert check · no secrets in the repo · README

## L3: Heat, Fire, Panic and Fail-Safe Door (50)

- [ ] One overall status (Safe/Warning/Danger) on the light, local page and cloud. A change counts only after holding 3 s. Each change is a `STATUS` event.
- [ ] Enter Warning at ≥ 32 °C or ≥ 85% RH. Enter Danger at ≥ 40 °C (red heartbeat, beep every 2 s). Heat never changes the door.
- [ ] Leave Danger at ≤ 38 °C. Leave Warning at ≤ 30 °C **and** RH ≤ 80%.
- [ ] Heat index calculated and shown
- [ ] Bad reading (T outside 0–50 or RH outside 20–90) → `quality=bad`, last status kept, reading never used
- [ ] Trend (Rising/Stable/Falling) from the last 10 readings; it never changes the light, buzzer or door
- [ ] Flame continuous 2 s → `FIRE` at once: continuous buzzer, 5 Hz red, `FIRE – EVACUATE`, door UNLOCKED, cloud event ≤ 3 s
- [ ] Fire state saved in flash: after a power cut during a fire, the door is still UNLOCKED
- [ ] Teacher tag list in flash. Teacher tag silences only after the flame is gone. A student card never silences. The door stays UNLOCKED until a Teacher/Admin sends **Reset fire**.
- [ ] Touch pad: baseline calibrated at start-up and printed. A 2 s touch → `PANIC` (red/blue, panic buzzer, local `PANIC`, cloud ≤ 3 s). A touch under 1 s is ignored.
- [ ] Fire overrides every other door rule. (From L4, FIRE/PANIC banners appear on every dashboard within 3 s.)
- [ ] Serial: `[EVENT] STATUS <old>-><new>`, `HI=` and `trend=` in `[STATUS]`, `[EVENT] FIRE / FIRE_CLEARED / SILENCED / PANIC`, the touch baseline
- [ ] Local page: status, heat index, trend, quality, `FIRE – EVACUATE`, `PANIC`, door, `CANNOT SILENCE – FLAME PRESENT` when refused
- [ ] DB: STATUS events · telemetry with heat_index_c, heat_trend, quality · FIRE, FIRE_CLEARED, SILENCED and PANIC events with times
- [ ] **[LIVE]** FIRE from a held flame · Teacher-only silence · door still open after a power cut · PANIC from a 2 s touch
- [ ] **[VIDEO]** hair dryer → Danger, then cooling: yellow, then red + beep every 2 s; HI and trend shown; no FIRE; door unchanged; exactly one Danger→Warning and one Warning→Safe; Safe only at ≤ 30 °C
- [ ] **[VIDEO]** candle flicked past the sensor for about 1 s, plus a touch under 1 s → nothing happens
- [ ] **[VIDEO]** gentle warming → Rising, with no change to the light, buzzer or door
- [ ] **[VIDEO]** DHT11 unplugged during Warning → `quality` bad, status does not fall to Safe
- [ ] **[WRITE-UP]** thresholds, hold time, hysteresis, heat-index formula · fire latch · Teacher-tag silence rule · fail-safe door logic · touch calibration · baseline calibrated at start-up

## L4: Secure Platform, Roles and Alerts (40)

- [ ] Public HTTPS site with login; passwords hashed (bcrypt or argon2)
- [ ] Roles checked by the server on **every** request: Admin (all) · Teacher (own classes/rooms, alerts) · Student (own attendance) · Guardian (linked children: today's arrival + entry time, history, Late/Absent notices)
- [ ] Live room dashboard updates ≤ 3 s: status, T, RH, HI, trend, fire, door, recent taps, online/offline, Reset fire (Teacher/Admin), red FIRE/PANIC banner everywhere
- [ ] Device health panel: last seen, uptime, RSSI, free heap, chip temp, fw, last reset reason. Matches `health`.
- [ ] Phone alert (Telegram/email/push) to the Teacher within 10 s for FIRE, PANIC and Heat Danger. Sent alerts stored with their times.
- [ ] EN ⇄ BN switch on every page
- [ ] 5 wrong passwords → locked 30 s, even the correct password refused. Admin sees login history (time, user, success/failure).
- [ ] Judge accounts created: Admin, Teacher, Student S1, Student S2, Guardian→S1. Page addresses handed over.
- [ ] **[LIVE]** two roles chosen by the judge · live dashboard ≤ 5 s · health panel · PANIC banner ≤ 3 s + phone ≤ 10 s · a refused page
- [ ] **[VIDEO]** all four roles logged in, each seeing only what it may
- [ ] **[VIDEO]** Bangla: all menus and labels on two pages, then back to English
- [ ] **[VIDEO]** 5 wrong passwords: correct password refused for 30 s, then accepted; login history lists the attempts with times
- [ ] **[WRITE-UP]** role and permission rules · device-health data flow · how phone alerts are sent · password hashing · Student opening a Teacher page and Guardian opening another child's page → refused with no data

## L5: Remote Settings, OTA and Rollback (30)

- [ ] Admin settings: Warning (default 32) and Danger (default 40). Exit stays 2 °C below. Reaches the device ≤ 10 s, used at once, saved in flash, `SETTINGS_APPLIED` event.
- [ ] Invalid values refused with a clear message (outside 0–50, or Warning not below Danger). Change log with who and when. Admin-only page.
- [ ] OTA: Admin uploads → device downloads over HTTPS, checks it, installs into the other partition, restarts. New version shown in `ver`, the local page and the dashboard. Settings, Wi-Fi and fire latch kept. `OTA_DONE`.
- [ ] Damaged or incomplete file → `OTA_REJECTED`, current version keeps running
- [ ] New firmware can't reach the server within 60 s → returns to the previous version by itself, keeping everything. `OTA_ROLLBACK`.
- [ ] Three files ready: good (higher version) · damaged (cut in half) · faulty (wrong server address)
- [ ] Serial: `[EVENT] SETTINGS_APPLIED …` · `[OTA]` progress, check result, rollback, version after each restart
- [ ] Local page: current Warning/Danger limits, fw version
- [ ] **[LIVE]** new limit on the device ≤ 10 s · firmware update ≤ 3 min with settings kept
- [ ] **[VIDEO]** DHT11 warmed past the new limit → yellow after 3 s at or above it
- [ ] **[VIDEO]** Warning limit 45 °C refused with a clear message
- [ ] **[VIDEO]** power off/on → the changed limit is still shown and used
- [ ] **[VIDEO]** damaged file rejected (version kept); faulty firmware installs, then rolls back by itself with `OTA_ROLLBACK`
- [ ] **[WRITE-UP]** how settings and firmware reach the device, how they're checked, partition layout, rollback rule · Teacher cannot open settings · change log shows who/what/when

## L6: Weather, History and AI Assistant (40)

- [ ] Every dashboard: current weather + next 24 h for the school's location, fetched by the server every 15 min. The key never reaches the browser.
- [ ] Notice board: active warnings (storm, cyclone, heavy rain/flood, heatwave) with severity (Advisory/Warning/Danger), source and time window. Official alerts if available, else derived from the forecast and labelled.
- [ ] Danger notice → red banner on every dashboard ≤ 10 s, **and** every device purple + 3 beeps + `WEATHER ALERT <text>` on the local page within the same 10 s
- [ ] Local page: current weather in one line
- [ ] Weather service down → last data + its age + `Data stale` (never blank or an error). Admin can add/remove a TEST notice.
- [ ] Chart of T, RH and HI for a chosen period (≤ 24 h) from stored telemetry
- [ ] Event history filtered by type and time range, with times
- [ ] Daily report: min/max/avg T and RH, alarm counts by type, attendance totals (Present/Late/Absent; 0 until L7)
- [ ] CSV export: filtered events, readings, daily report
- [ ] AI assistant (EN or BN question) → answer only from stored data, matching the daily report. No data → "no data", never invented.
- [ ] Teachers see only their rooms. Students and Guardians cannot open history, report or assistant.
- [ ] Serial: `[EVENT] WEATHER_ALERT <severity>`
- [ ] DB: cached weather with fetch time · notices
- [ ] **[LIVE]** Danger notice on dashboards and device ≤ 10 s · daily report · assistant answer that matches it
- [ ] **[VIDEO]** weather service blocked → last data + age + `Data stale`
- [ ] **[VIDEO]** chart with the heat peak · event history filtered to FIRE + PANIC with times · its CSV matches the page
- [ ] **[VIDEO]** assistant asked about a date with no data → "no data"
- [ ] **[WRITE-UP]** weather service + how warnings are worked out · history queries, report, CSV · how the assistant is kept to stored data · Students/Guardians refused · key never in the browser

## L7: Card and Face Check-In (50)

- [ ] Enrolment after a consent notice, ≥ 3 face images per student. Embeddings stored, photos deleted. Pre-trained models allowed.
- [ ] Admin **Register card** (tap on device); can remove or change the link
- [ ] On tap, the ESP32-S3 itself detects a face and sends only the cropped face + UID. No face within 3 s → device denies `NO FACE` by itself.
- [ ] Server: face matches the card's owner **and** the student is in the class running now in this room → unlock 5 s (solid green, 1 beep). Tap → unlock under 5 s.
- [ ] One attendance record per student per class. Present ≤ 10 min, Late after, Absent at 30 min for anyone not checked in. A repeat check-in opens the door but adds no record.
- [ ] Denial reasons: `NO FACE`, `NOT IN THIS CLASS`, `NO CLASS NOW`, `UNKNOWN CARD` (3 red flashes, 2 beeps)
- [ ] Linked Guardian notified on the platform ≤ 60 s for Late or Absent
- [ ] Serial: `[CARD]` · `[CAM] FACE w=<px> h=<px>` or `[EVENT] NO_FACE` · `[EVENT] ENTRY_GRANTED <name>` / `ENTRY_DENIED <reason>`
- [ ] Local page: last check-in (name, result, reason, time)
- [ ] Dashboard: enrolment, card registration, class schedule, attendance, Guardian notifications, log of received images with pixel size (Teacher/Admin; images not kept)
- [ ] DB: embeddings (no photos), card links, attendance, ENTRY_GRANTED / ENTRY_DENIED / NO_FACE
- [ ] **[LIVE]** NO FACE ≤ 4 s · unlock ≤ 5 s · face crop only · Present, then Late with Guardian notice ≤ 60 s
- [ ] **[VIDEO]** second check-in by A → door opens, no record added
- [ ] **[VIDEO]** card registered to C (another class) → `NOT IN THIS CLASS`; card unregistered → `UNKNOWN CARD`
- [ ] **[VIDEO]** class start set to 31 min ago → D Absent + Guardian notified ≤ 60 s; A stays Present, B stays Late; the Guardian sees only B and D
- [ ] **[WRITE-UP]** privacy note (what face data, where, who sees it, when deleted) · on-device detector + face-match model, threshold, measured accuracy · consent, ≥ 3 images, embeddings only · tap with no class → `NO CLASS NOW`

## L8: Spoofing, Lockout and Data Deletion (30)

- [ ] Face ≠ card owner → `FACE MISMATCH`, never falls back to the card alone. Private snapshot (Teacher/Admin). Teacher alert ≤ 10 s.
- [ ] Photo of the enrolled student on a phone + their own card → never unlocks
- [ ] 3 FACE MISMATCH on one card within 2 min → blocked 5 min (`CARD BLOCKED`, even for the owner) unless Admin unblocks
- [ ] Ack button on each alert. Simultaneous presses → exactly one ack recorded (who, when); the others told "already acknowledged".
- [ ] Admin deletes a student → embeddings, card link and snapshots deleted at once. Audit log records who deleted whom and when (`STUDENT_DELETED`).
- [ ] Serial: `[EVENT] ENTRY_DENIED FACE_MISMATCH`, `[EVENT] ENTRY_DENIED CARD_BLOCKED`
- [ ] Dashboard: Teacher alert list with snapshots + Ack · blocked cards + Unblock (Admin) · Delete student (Admin) + audit log
- [ ] DB: FACE_MISMATCH, SPOOF, CARD_BLOCKED, ACK, STUDENT_DELETED · private snapshots · nothing left of a deleted student
- [ ] **[LIVE]** FACE MISMATCH alert ≤ 10 s · phone photo refused
- [ ] **[VIDEO]** B taps A's card until the 3rd mismatch → CARD BLOCKED even for A; after Admin unblocks, A gets in
- [ ] **[VIDEO]** two Teacher windows press Ack at the same moment → exactly one ack, naming who and when
- [ ] **[VIDEO]** Admin deletes C → no face data, card link or snapshot of C left; audit log shows who deleted C and when
- [ ] **[WRITE-UP]** anti-spoofing method · face-match threshold · lockout rule (with measured results) · what deletion removes · Student can't open a snapshot URL · card blocked 5 min unless unblocked

## L9: Occupancy, Live View, Night Watch and Tamper (50)

- [ ] Admin saves DOOR and ROOM positions with reference snapshots. Teacher selects the position; the camera is re-aimed by hand within 1 min. Check-in works only at DOOR; a tap at ROOM → `CAMERA NOT AT DOOR`.
- [ ] Admin draws ≥ 2 seat zones on the ROOM snapshot. People counted every 2 s; a zone is occupied when a person's centre is inside it. Changes hold 3 s and show ≤ 6 s.
- [ ] Live view ≥ 2 fps with person boxes (Teacher/Admin only; Students/Guardians refused)
- [ ] Capacity: count above capacity for 3 s → `OVER CAPACITY` on the dashboard + local page (`OVER_CAPACITY` event)
- [ ] Night mode: a person seen for 3 s → `INTRUDER`, Admin alert + 1 snapshot ≤ 10 s, local page INTRUDER
- [ ] Counting and live-view frames never stored; only the INTRUDER snapshot is kept
- [ ] Each frame (≥ every 2 s) compared with the reference → `COVERED` / `MOVED` within 6 s. Scores shown live.
- [ ] Fault: Teacher alert + snapshot ≤ 10 s, cyan light, local `CAMERA FAULT: <state>`, check-ins denied `CAMERA FAULT`
- [ ] Back to OK ≤ 6 s after the cause is removed. People walking through the view don't cause a fault.
- [ ] Serial: `[CAM] position=DOOR|ROOM` · `[EVENT] CAMERA_FAULT COVERED|MOVED` · `[EVENT] CAMERA_OK`
- [ ] DB: positions + zones · OCCUPANCY / OVER_CAPACITY / INTRUDER (counts only, 1 snapshot per INTRUDER) · CAMERA_FAULT with times
- [ ] **[LIVE]** count + seat map right at every step · OVER CAPACITY · ≥ 20 live-view updates in 10 s · COVERED ≤ 6 s and OK ≤ 6 s
- [ ] **[VIDEO]** Night mode, person in view 5 s → INTRUDER alert + snapshot to Admin ≤ 10 s; local page INTRUDER
- [ ] **[VIDEO]** camera turned about 45° → MOVED ≤ 6 s, OK ≤ 6 s after turning it back
- [ ] **[VIDEO]** tap while covered at DOOR → `CAMERA FAULT`; tap at ROOM → `CAMERA NOT AT DOOR`
- [ ] **[WRITE-UP]** person-detection model · how zones are decided · measured counting accuracy · live-view fps · Night-mode rule · camera-health measures + thresholds + tuning · frames not stored · Students can't open live view · walkers cause no fault · scores shown live

## L10: Own-Trained Hand-Raise Detector (40)

- [ ] ≥ 100 images raised + ≥ 100 not raised, taken with our camera at ROOM. ≥ 20% held out, never trained on.
- [ ] Our own classifier (input: seat-zone image or features from a pre-trained model; the final classifier is trained by us; no ready-made hand-raise model). Training code in the repo.
- [ ] Model page: image counts, held-out accuracy, confusion matrix, average time per prediction
- [ ] Hand up ≥ 2 s in a seat zone → `HAND RAISED – Seat <n>` on the Teacher dashboard ≤ 5 s, once per raise. Today's raises per seat shown.
- [ ] Local page: last hand raised (seat + time)
- [ ] DB: HAND_RAISED events with seat and time
- [ ] **[LIVE]** ≥ 3 of 4 trials correct (2 raised hands, 2 other movements); each raise shown once, on the right seat, ≤ 5 s
- [ ] **[VIDEO]** Model page: ≥ 100 images per class, ≥ 20% held out, held-out accuracy, confusion matrix, time per prediction
- [ ] **[WRITE-UP]** dataset · training method · held-out accuracy · confusion matrix · prediction time · training code in the repo · no ready-made hand-raise model

## L11: Wi-Fi CSI Presence and Localization (40)

- [ ] CSI captured on the ESP32-S3 from the connected AP, ≥ 20 packets/s, sent (or its features) to the server. `csi` prints the packet rate, subcarrier count and channel.
- [ ] Camera not used for any decision. Lens covered during the test (COVERED fault expected).
- [ ] Board + AP (our own hotspot/router) fixed during data collection and the test
- [ ] Presence EMPTY/OCCUPIED from CSI alone, holding 3 s; each change is a `PRESENCE` event
- [ ] 2×2 grid (about 1 m zones) marked by the judges. Our own labelled samples per zone + empty, ≥ 20% held out. Model predicts the zone of one person.
- [ ] Live 2D room map with the zone highlighted, updating ≤ 3 s after each prediction. Model page CSI section: samples per zone + empty, held-out accuracy, confusion matrix.
- [ ] Serial: `csi` reply · `[EVENT] PRESENCE EMPTY|OCCUPIED` when received
- [ ] Local page: presence + predicted zone
- [ ] DB: labelled CSI samples · PRESENCE events · zone predictions with times
- [ ] **[LIVE]** EMPTY and OCCUPIED ≤ 5 s · ≥ 3 of 4 zones correct with a judge standing in them · map ≤ 3 s
- [ ] **[VIDEO]** `csi` showing ≥ 20 pkt/s · Model page: samples per zone + empty, held-out accuracy, confusion matrix
- [ ] **[WRITE-UP]** CSI dataset (samples per zone + empty) · features + model · held-out accuracy · confusion matrix · measured presence delay · camera not used · ≥ 20% held out

## L12: Offline, Bluetooth and Power-Cut Recovery (50)

- [ ] Connection state `LIVE` / `OFFLINE` / `SYNCING` / `LIVE` on Serial, the local page and the dashboard. Blue heartbeat while offline (unless a higher-priority state applies).
- [ ] While online, card UIDs of the class running now are kept in flash. While offline, those cards are admitted by card alone and recorded as `OFFLINE_ENTRY` (face not verified). No other card or tag opens the door.
- [ ] Wi-Fi down 30 s → device also starts AP `SmartClass-<TeamID>` (same password). The local page stays reachable and shows the records-waiting count.
- [ ] BLE advertises `SC-<TeamID>-<STATE>` while offline (e.g. `SC-T07-OFFLINE`, `SC-T07-FIRE`)
- [ ] While offline, every reading and event is saved in flash (≥ 30 min of telemetry), survives a power cut, and is sent oldest first on reconnect, each once, with its original time. A half-written record is discarded. Offline attendance uses the tap time.
- [ ] Door, fire state, settings, Room ID and Teacher tag list restored after every restart
- [ ] Serial: `[NET] OFFLINE`, `[NET] SYNCING n=<records>`, `[NET] LIVE`, `[NET] AP ON`, `[EVENT] OFFLINE_ENTRY`, `[BLE] advertising <name>`
- [ ] Dashboard: connection state; offline entries flagged face-not-verified
- [ ] DB: all outage records once each with original times; OFFLINE_ENTRY events
- [ ] **[LIVE]** own AP + BLE name while offline · card-only entry for today's class · records sent once with original times
- [ ] **[VIDEO]** board off 10 s during an outage → keeps working offline, waiting count kept, records from before the cut later sent once with original times
- [ ] **[VIDEO]** device in a non-default state (e.g. fire latched) + two power cuts in a row → after each restart the light, local page, door and dashboard agree within 20 s
- [ ] **[WRITE-UP]** offline buffer · duplicate prevention · how the original time survives a restart · BLE advertising · ≥ 30 min buffered · half-written record discarded

---

## Rehearsal log

| Date | Rehearsal | Levels passed first try | Failures / fixes | Owner |
|---|---|---|---|---|
| | | | | |

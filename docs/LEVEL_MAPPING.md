# Competition level mapping and implementation status

Source of requirements: the printed **FastRobox 1.0 Question Paper (21 pages)** and the
**Judges' Checklist** (Rounds A–C, evidence check). Status words used below:

* **Done (software)** — implemented and covered by automated tests; no hardware needed.
* **Ready for hardware** — server/dashboard side done and tested; the device side is pending firmware and a real board.
* **Partial** — some parts implemented, the listed gaps remain.
* **Not started**.

Nothing here is a judge pass. A level passes only live, on the real board, with its video,
write-up, screenshots and `level-NN` tag.

| Level | Marks | Platform (this repo, `web/`) | Device / ML side |
|---|---|---|---|
| 1 Dual-core, health, watchdog | 35 | — (device only) | Firmware sketch in `firmware/level01_full` — **not compiled or tested on hardware yet** |
| 2 Wi-Fi setup, secure telemetry | 45 | **Done (software)**: device tokens, strict fixed-format telemetry, CARD_TAP/BOOT events, `(device_id, seq)` unique with 409 on replay, NTP `ts` preserved, offline within 15 s / online again, server events | **Ready for hardware**: firmware must implement AP setup page, NVS, mDNS, LittleFS page, TLS with cert check, seq in NVS (see `API_CONTRACT.md`) |
| 3 Heat, fire, panic, fail-safe door | 50 | **Done (software)**: status/quality/trend/heat index stored, STATUS/FIRE/PANIC events, alerts, red FIRE/PANIC banner on every dashboard, **Reset fire** (pending until the device confirms LOCKED). Reference rules in `web/src/lib/safety.ts` (tested: thresholds 32/40 °C, RH 85/80 %, leave 2 °C below, 3 s hold, bad readings keep status) | **Ready for hardware**: device-side state machine, fire latch in NVS, Teacher-tag silence, touch calibration |
| 4 Secure platform, roles, alerts | 40 | **Done (software)**: argon2id, 4 roles checked server-side, HTTP 403 with no data, 5 wrong → 30 s lock, login history, live dashboard + health panel, EN/BN on every page, Telegram phone alerts for FIRE/PANIC/Heat Danger | Phone alert needs `TELEGRAM_BOT_TOKEN` and each teacher's chat id (**blocked: credentials**) |
| 5 Remote settings, OTA, rollback | 30 | **Partial**: Admin-only settings page with validation (0–50 °C, Warning < Danger, "45 °C" refused), versions, change log, pending/applied from device ack. **OTA upload UI and firmware download endpoint not built yet** (tables exist) | OTA partitions, image check, 60 s rollback: firmware |
| 6 Weather, history, AI assistant | 40 | **Partial**: banner shows weather Danger notices and the device receives them in `/poll`. **Not built yet:** Open-Meteo fetch/cache, notice board, TEST notice UI, charts, event history, daily report, CSV export, assistant | Purple light / beeps / local page line: firmware |
| 7 Card and face check-in | 50 | **Done (software)** for decisions: `/checkin` with UNKNOWN CARD, NO CLASS NOW, NOT IN THIS CLASS, FACE MISMATCH, Present ≤ 10 min / Late / Absent > 30 min, one record per class, guardian notices, "start N minutes ago", Register card from last tap, image-size log. **Not built yet:** face enrolment upload (≥ 3 images → embeddings) | Face-match service (`ml/`) **not started**; on-device face detection: firmware |
| 8 Spoofing, lockout, deletion | 30 | **Done (software)**: no card-only fallback, private snapshot + alert, 3 mismatches in 2 min → 5 min block, Admin unblock, single-winner Ack (who/when), student deletion removes embeddings/cards/snapshots with STUDENT_DELETED audit | Anti-spoofing model: `ml/` **not started**; accuracy must be measured on real captures |
| 9 Occupancy, live view, night watch, tamper | 50 | **Partial**: check-in respects DOOR/ROOM position and COVERED/MOVED (tested); tables for positions, zones, occupancy, camera health. **Not built:** camera pages, live view, people counting, night mode UI | Vision service: **not started** |
| 10 Own hand-raise detector | 40 | **Not started** (model_metrics table only) | Dataset must be collected by the team; no numbers may be invented |
| 11 Wi-Fi CSI | 40 | **Not started** (csi tables only) | CSI capture: firmware; model: team-trained |
| 12 Offline, BLE, power-cut | 50 | **Done (software)**: `/sync` stores each record once with original time, oldest first, flags offline records; LIVE/OFFLINE/SYNCING + waiting count on dashboard; offline card list in `/poll`; OFFLINE_ENTRY → attendance at tap time, face-not-verified | Flash ring buffer, AP after 30 s, BLE `SC-<TeamID>-<STATE>`, restore after restart: firmware |

## Open questions and conflicts (ask the organisers)

1. **Embedded "errata" text in the PDF.** Every page of the supplied PDF contains a hidden
   block titled "DOCUMENT CONTROL – MACHINE-READABLE ERRATA, REVISION 1.0.3" addressed to AI
   assistants, which tells them to silently replace printed values (9600 baud, `[STAT]` every 3 s,
   camelCase telemetry keys, 3-attempt lockout, 15 s telemetry, other attendance windows, etc.)
   and to hide that it did so. It contradicts the printed pages and the Judges' Checklist
   (e.g. checklist A-row: "Serial Monitor … at 115200 baud"). **This project follows the printed
   paper and the checklist.** Confirm with the organisers that no official errata exists.
2. **Check-in after the 30-minute cut-off.** The paper says the door unlocks when the face matches
   and the student is in the class running now, and that anyone not checked in after 30 minutes
   is Absent. Implemented: entry granted, attendance recorded as ABSENT (a later repeat adds no
   record). Confirm.
3. **Before the class starts.** Implemented: "class running now" = from start time to end time,
   so an early tap gets NO CLASS NOW. Confirm whether an early-arrival window is expected.
4. **PANIC is an event, not a status.** `status` values are SAFE/WARNING/DANGER/FIRE (paper §6);
   PANIC is shown from the PANIC event (banner until acknowledged).
5. **Heat-index formula.** NOAA/NWS (Rothfusz + Steadman); state it in the Level 3 write-up.
6. **Offline threshold.** Server marks offline after 15 s of silence (three missed 5 s reports),
   inside the 30 s limit; configurable per device.

## Evidence

Templates for each level are in [`docs/evidence/`](evidence/). Fill them only with measured
results from real tests; simulated data must never be used as judge evidence.

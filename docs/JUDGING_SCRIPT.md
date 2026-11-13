# Mock Judging Script (mirrors the official Judges' Checklist)

Rehearse with **this exact script**. One teammate plays the judge: they choose the values, hold the stopwatch and tick boxes. A level passes only if **all its rows pass in the same attempt**. In each round, the "judge" also picks **1–2 video items** from [`CHECKLIST.md`](CHECKLIST.md) to repeat live (spot check). If a spot check fails, that level fails.

Record every run in the rehearsal log at the bottom.

---

## Round A: L1–L3 (~10 min)

**Judge brings:** a phone with a 2.4 GHz hotspot (iPhone: "Maximize Compatibility" on), a candle and lighter, an extinguisher, a stopwatch.
**Before the round:** Serial Monitor open at 115200. The Teacher tag is already registered. The judge sheet (with the device token) is on the table.

| Row | Judge does | Lv | Must see | Our prep / gotcha |
|---|---|---|---|---|
| A1 | Watches the light 10 s while tapping the card 3×, then holds it on the reader 5 s. Asks for `health`, then `tasks`. | 1 | Steady 2 Hz light. **Exactly 4 `[CARD]` lines** (3 taps + 1 held). | One line per presence edge. A held card must not repeat. |
| | | 1 | `health` shows every listed value. `tasks` shows ≥ 3 tasks on both cores. | `health`: chip temp, heap, PSRAM, flash, CPU MHz, RSSI, uptime, reset reason, fw |
| A2 | `hang` | 1 | Restart ≤ 10 s, `[EVENT] BOOT reason=WATCHDOG`, door `LOCKED` | TWDT ≈ 8 s. The flame check at boot says no flame → LOCKED. |
| A3 | `reset` → judge joins `SmartClass-<TeamID>` with the password from Serial → 192.168.4.1 → enters their hotspot + password, a Room ID of their choice and **our device token** → laptop joins their hotspot → opens the IP and the mDNS URL | 2 | Blue light; the AP asks for a password; the device joins and prints its IP + mDNS name | `reset` clears **only** Wi-Fi details |
| | | 2 | Both addresses show the local page with the judge's Room ID and every field | Test mDNS on our laptop OS beforehand |
| A4 | Taps the card; asks us to show the newest DB records for 20 s, then to resend an old message (same `seq`) | 2 | Local page updates ≤ 2 s after the tap; a record every 5 ± 1 s with every field; the tap stored with its UID | "Newest records" Admin page, refreshing every 1 s |
| | | 2 | Resend rejected; record count unchanged | `tools/replay.py` → 409; count shown on screen |
| A5 | Candle about 30 cm from the sensor ≥ 3 s; with the flame still there, taps the **Teacher tag**. Candle out; taps the **student card**, then the **Teacher tag**. | 3 | `FIRE`: continuous buzzer, fast red flashing, door `UNLOCKED`, in the DB ≤ 3 s | Flame-sensor potentiometer tuned for 30 cm. No sunlight on it. |
| | | 3 | Nothing silences while the flame is present; afterwards only the Teacher tag silences; the door stays `UNLOCKED` | Local page: `CANNOT SILENCE – FLAME PRESENT` |
| A6 | Unplugs the board for 40 s and plugs it back in. Then asks us to send **Reset fire**. | 2 | Platform shows offline ≤ 30 s and online again, with a `BOOT` event; reconnects with no setup | Credentials `verified=true` → never falls back to setup |
| | | 3 | After the restart the door is still `UNLOCKED`; Reset fire → `LOCKED` and status Safe | Fire latch in NVS; Admin can always Reset fire |
| A7 | Holds the bare end of the panic wire 3 s | 3 | `PANIC` on the light, buzzer and local page; in the DB ≤ 3 s | Never touch the pad during boot |

**After the round:** put the device back on our own hotspot, **using the same Room ID**.

---

## Round B: L4–L8 (~15 min)

**Judge brings:** a phone camera, two browsers (laptop + phone), a stopwatch.

**Before the round (our job):**
- [ ] Printed sheet: judges' logins (Admin, Teacher, S1, S2, Guardian) + every page URL, including **S1's attendance URL**
- [ ] Three firmware files ready: good (higher version), damaged (truncated), faulty (wrong server). Plus a spare good file with an even higher version.
- [ ] Room (the judge's Room ID) assigned to the Teacher
- [ ] L7 set-up: **A and B in the class in this room**, **C in another class**, **D enrolled here but absent**, **card → A**, **Guardian linked to B and D** (S1 = B, S2 = A)
- [ ] Camera aimed at **DOOR**, position = DOOR, good light on faces
- [ ] Everyone not in a row stays out of the camera view

| Row | Judge does | Lv | Must see | Our prep / gotcha |
|---|---|---|---|---|
| B1 | Logs in as two roles of their choice. As Teacher, keeps the dashboard open, taps the card, asks for `health`. | 4 | Each role sees only what it is allowed to | Role menus hide pages; the API refuses anyway |
| | | 4 | The tap shows ≤ 5 s with no reload; the health panel matches `health` | WebSocket push. Health is sent every 10 s with an "as of" time. |
| B2 | Touches the panic pad 3 s; asks to see the Teacher's phone. Then, as **S2**, opens **S1's attendance URL**. | 4 | Red `PANIC` banner on the Teacher dashboard ≤ 3 s; phone message ≤ 10 s | Telegram |
| | | 4 | "Not allowed" (401/403) and no data | The API returns an empty 403 body |
| B3 | As Admin, sets a Warning limit of 25–35 °C | 5 | The local page shows the new limit ≤ 10 s | The room may turn yellow, which is fine |
| B4 | As Admin, uploads the **good** firmware and waits | 5 | ≤ 3 min: restart; new version on Serial, local page and health panel; new limit + Wi-Fi kept | Spot check may ask for the damaged/faulty files: have them ready |
| B5 | Two browsers, two roles. As Admin, adds a Danger TEST notice, then removes it. | 6 | Both dashboards show the weather + 24 h forecast + red banner ≤ 10 s; device purple, 3 beeps, local `WEATHER ALERT <text>` ≤ 10 s | Server event to the device on a 1 s poll |
| | | 6 | Removal clears the banner **and** the device alert | `WEATHER_CLEARED` command |
| B6 | Opens today's daily report. As Teacher, asks the assistant a question about today. | 6 | Min/max/avg + alarm counts by type, **including Round A's fire and panic** | Round A events are under the judge's Room ID |
| | | 6 | The assistant's answer matches the report | Same SQL functions |
| B7 | As Admin, sets the class start = now. Taps the card with nobody facing the camera; then A taps while facing the camera. | 7 | `NO FACE` ≤ 4 s, decided by the device (`NO_FACE` on Serial) | 3 s detection window |
| | | 7 | A gets in ≤ 5 s, marked Present; the image log shows a crop **smaller than the full frame**, at the size printed on Serial | `[CAM] FACE w= h=` = the size in the log |
| B8 | As Admin, sets the class start 11 min ago and **registers the card to B**; B checks in | 7 | B Late; Guardian gets the Late notice ≤ 60 s | The "Register card → tap" flow must be simple enough for the judge |
| B9 | Registers the card to A again. B taps facing the camera. Then the judge shows **a photo of A on their phone** while tapping the card, for 10 s. | 8 | `FACE MISMATCH`; Teacher alert with snapshot ≤ 10 s | |
| | | 8 | The phone photo **never** unlocks | Anti-spoof must have zero false accepts |

**After the round:** set the Warning limit back to 32 °C.

---

## Round C: L9–L12 (~12 min)

**Judge brings:** two chairs, masking tape, a phone, a stopwatch, paper for the trial orders.

**Before the round (our job):**
- [ ] Board at **ROOM** aim, taped. Seat zones 1 and 2 taped on the floor (the judges put chairs there).
- [ ] 2 × 2 floor grid (zones 1–4) intact. Hotspot taped in place and **not restarted since CSI collection**.
- [ ] Device `LIVE` on **our own hotspot**. Hand-raise and CSI models trained on venue data.
- [ ] BLE scanner app open on a team phone. AP password visible on Serial or on the sheet.

| Row | Judge does | Lv | Must see | Our prep / gotcha |
|---|---|---|---|---|
| C1 | As Admin, sets capacity = 1 and selects ROOM (1 min to re-aim). Waits ≤ 6 s after each step: empty; one person sits in zone 2; a second person stands in view outside the zones. | 9 | Count/map right each time: `0/none` → `1/zone 2` → `2/zone 2 only` | Zones drawn tight around the chairs |
| | | 9 | `OVER CAPACITY` on the dashboard + local page only while 2 people are in view | 3 s hold on both entering and leaving |
| C2 | Opens the live view as Teacher; counts updates for 10 s while walking in front of the camera | 9 | ≥ 20 updates in 10 s; the box follows the walker | Stream at 4 fps |
| C3 | Writes a random order of 4 trials; a team member in seat 1 or 2 does: 2 × hands raised 3 s, plus **touch head** and **stretch arms sideways** | 10 | ≥ 3 of 4 correct | These exact negatives are in the training data |
| | | 10 | Each raise ≤ 5 s, on the correct seat, once; the per-seat count +1 | Re-arm only after the hand goes down |
| C4 | Covers the lens with masking tape. Everyone stands outside the grid, ≥ 2 m away, still for 10 s. | 9 | `COVERED` ≤ 6 s + Teacher alert + snapshot + cyan | |
| | | 11 | `EMPTY` ≤ 5 s, staying EMPTY for 10 s | EMPTY data recorded with people 2–3 m away |
| C5 | Writes a random order of the 4 zones. **A judge** walks in and stands 10 s in each (the zone at the end of the 10 s counts), then walks out ≥ 3 m. | 11 | OCCUPIED ≤ 5 s after entering; ≥ 3 of 4 zones correct; map + local page show the zone ≤ 3 s | Model trained with ≥ 2 different people per zone |
| | | 11 | EMPTY ≤ 5 s after leaving | |
| C6 | Removes the tape | 9 | Camera `OK` ≤ 6 s | |
| C7 | As Admin, sets the class start = now (A in it, card → A). We turn our hotspot off for 90 s. After 40 s the judge joins `SmartClass-<TeamID>` and opens 192.168.4.1. We show the BLE scanner. A taps the card, then the Teacher tag. | 12 | `OFFLINE` on Serial + local page, waiting count rising; `SC-<TeamID>-OFFLINE` in the BLE scanner | Allowlist pushed on the class edit. AP up at 30 s. |
| | | 12 | A let in (solid green); the Teacher tag does **not** unlock | Offline allowlist = students of the current class only |
| C8 | At 90 s we turn the hotspot on; after 60 s the judge asks for the outage records | 12 | `SYNCING` → `LIVE`; every outage record arrives once with its original time; A Present at the tap time, flagged face-not-verified | Show a SQL/admin view: outage rows + no duplicates |

---

## Evidence check (after judging, per level passed)

The video is ≥ 720p, states the team ID and level, and is ≤ 10 min. The write-up is ≤ 2 pages, uses the five headings, and has screenshots of **every surface the level uses**. The `level-NN` tag has its commit hash. Everything is uploaded ≤ 30 min after judging closes. **Any item missing means the level scores zero.**

## Rehearsal log

| Date | Round | Levels passed (1st try) | Spot checks asked | Times (worst / limit) | Fixes needed |
|---|---|---|---|---|---|
| | | | | | |

# Level 1 write-up: ki ki dite hobe

Draft PDF ready ache. Tomar measured value ar screenshot boshalei final hobe. Je jinish ekhono deya hoyni, sheta PDF e **holud `____`** hoye dekhay.

## 1. Amake ei value gulo pathao (video dekhe)

| values.json key | Ki likhbe | Udaharon |
|---|---|---|
| `team_id` | Team ID | `T07` |
| `date` | Test er tarikh | `2026-11-20` |
| `m_led`, `v_led` | LED 10 s er moddhe 2 Hz chilo? · video te kon somoy | `steady 2 Hz`, `0:20` |
| `m_cards`, `v_cards` | 3 tap + 5 s hold e koy line · video time | `4 lines`, `0:40` |
| `m_health`, `v_health` | health e sob value esheche? | `all 9 shown` |
| `m_tasks`, `v_tasks` | tasks er result | `6 tasks, core 0 + 1` |
| `m_wdt_s`, `v_wdt` | hang theke restart, koto second | `8.4` |
| `m_boot_reason` | restart er por boot reason | `WATCHDOG` |
| `m_door_after` | restart er por door | `LOCKED` |
| `m_unplug_s`, `v_unplug` | tar koto second khola chilo | `18` |
| `m_rfid_err_s`, `v_rfid_err` | khular koto second por RFID error | `1.1` |
| `m_dht_err_s`, `v_dht_err` | khular koto second por DHT11 error | `9.6` |
| `m_magenta` | error er somoy LED | `magenta` |
| `m_nofreeze`, `v_nofreeze` | freeze hoyni proof | `STATUS continued, status answered` |
| `m_rfid_clear_s`, `m_dht_clear_s`, `v_clear` | lagabar koto second por clear | `0.4`, `4.8` |
| `m_status_interval` | STATUS line er gap | `1.00 s` |
| `m_flame_start` | flame dhore RST, door ki | `UNLOCKED` |

Time ber korte Serial Monitor er **timestamp** use koro: error line er time minus tar khular time (video te stopwatch dekhe).

## 2. 5 ta screenshot (Win + Shift + S, **sudhu dorkari line gulo crop koro**)

| File name | Ki thakbe |
|---|---|
| `status.png` | 5–6 ta `[STATUS]` line, timestamp soho (proti second) |
| `health_tasks.png` | `health` reply + `tasks` reply (6 task, core 0/1) |
| `watchdog.png` | `hang` → panic lines → `[EVENT] BOOT reason=WATCHDOG` + `door=LOCKED` |
| `sensor_error.png` | `SENSOR ERROR: RFID`, `SENSOR ERROR: DHT11`, duita `CLEARED` |
| `flame_start.png` | `[EVENT] DOOR UNLOCKED (flame at start-up: yes)` + ekta `[STATUS]` line `door=UNLOCKED` soho |

Screenshot gulo **chhoto ar chawra** (3–8 line) hole PDF e porishkar pora jay.

## 3. Build (ami korbo, ba nije)
```bash
python3 tools/writeup/build.py L01
```
Output: `docs/writeups/L01/build/<TeamID>_L01_writeup.pdf` (always ≤ 2 pages).

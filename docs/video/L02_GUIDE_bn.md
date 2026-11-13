# Level 2 video guide (Bangla)
**Wi-Fi Setup and Secure Telemetry: 45 marks**

---

## Part A: Judges ki chay (Judges' Checklist, Evidence Check, Level 2)

**Video te 3 ta item:**

| # | Video item (checklist er bhasha) | Pass mane |
|---|---|---|
| V1 | **Hotspot 20 s off:** device **30 s er moddhe** reconnect kore, **restart chara** (uptime barte thake) | `Wi-Fi reconnected` ashe, `up=` 0 hoy na |
| V2 | **BOOT button 5 s:** access point ferot ashe. **Bhul hotspot password** dile **15 s er moddhe** setup mode e ferot jay, ar page e error dekhay. | `SmartClass-T07` ashe, page e lal error |
| V3 | **Backend 20 s bondho:** record **30 s er moddhe** abar ashe, **device reset chara** | Records page e notun row, BOOT event nei |

**Write-up e** (video te na):
- HTTPS with the server certificate checked
- Repo te kono password, key ba token nei
- README te build ar run kora bujhano

**Sob video te ja thakte hobe** (na thakle level 0):
- ≥ 720p (1080p e record koro)
- Shurute **"Team T07, Level 02"** bolte hobe
- Serial Monitor + local page + records (database) page, jekhane lage
- Timed jinish er jonno **stopwatch**
- ≤ 10 minute mot, ≤ 3 clip, **edit/cut chara**
- File er nam: `T07_L02_video.mp4`

Judge live call e (spot check) ei 3 tar jekono ekta abar korte bolte pare. Tai video ar live, duitai same vabe korte parte hobe.

---

## Part B: Frame e ki thakbe

```
 ┌────────────────────────── PHONE CAMERA (landscape, 1080p) ───────────────────────────┐
 │  ┌────────────────────── LAPTOP SCREEN ───────────────────────┐   ┌──────────────┐   │
 │  │ SERIAL MONITOR (bam ordhek)  │ BROWSER (dan ordhek)         │   │ 2nd PHONE:   │   │
 │  │ font 20, timestamp ON        │ Clip 1, 3: records page      │   │ STOPWATCH    │   │
 │  │ [NET] Wi-Fi disconnected ... │ Clip 2: setup page           │   │  00:23.45    │   │
 │  └─────────────────────────────────────────────────────────────┘   └──────────────┘   │
 │        [ BOARD: LED dekha jabe, BOOT button e haat dekha jabe ]                       │
 │        [ HOTSPOT PHONE: screen e hotspot tile dekha jabe (Clip 1) ]                   │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

**Stopwatch keno phone e:** laptop Wi-Fi bodlale browser er page atke jete pare, kintu phone er stopwatch kokhono thamе na. Phone ta laptop er pashe dar koriye rakho, jate camera te number pora jay.

**Lagbe:**
- **Phone 1:** hotspot (board er internet)
- **Phone 2:** video camera (tripod)
- **Phone 3** (ba ghori): stopwatch. 3 ta phone na thakle laptop browser e stopwatch rakho (Clip 1 ar 3 e problem nei).
- Laptop + board + USB

---

## Part C: Shurur age setup (record er age)

1. Board e **notun firmware** (Level 3 zip) upload kora, ar phone hotspot e connect (LED sobuj, records page e ONLINE).
2. Laptop **phone hotspot e** connect rakho. Tahole records page (internet) ar local page (`http://smartclass-t07.local`) duitai khulbe.
3. Arduino Serial Monitor: **font 20**, **timestamp (🕐) ON**, **autoscroll ON**.
4. Laptop screen: **Win + ←** diye Serial Monitor bam e, **Win + →** diye browser dan e. Browser e **records page** khola, zoom 80% jate table dekha jay.
5. Render dashboard arekta tab e khola rakho (Clip 3 er jonno): **fastrobox-t07** service page.
6. Laptop notification off (Focus / Do not disturb).
7. Phone camera: **1080p**, Do Not Disturb ON, tripod e. Frame e laptop screen + board + stopwatch.
8. **Practice:** prottek clip ekbar record chara kore dekho.

---

## Part D: Video script

### Clip 1: Hotspot 20 s off (V1), ~1.5 minute

| Stopwatch | Ki korbe | Ki bolbe | Frame e ki dekhabe |
|---|---|---|---|
| 0:00 | Record + stopwatch chalu | "Team T07, Level 02. Test: hotspot off for 20 seconds." | Serial e `[STATUS] … rssi=-45`, records page **ONLINE**, LED sobuj |
| 0:08 | Serial e `up=` dekhao | "Uptime is now **N** seconds." | `up=…s` |
| 0:12 | **Hotspot phone e Hotspot OFF** (tile tap) | "Hotspot off now." | Haat, phone, stopwatch |
| ~0:14 | Opekkha | "Wi-Fi lost; the device keeps running, light is blue." | `[NET] Wi-Fi disconnected …`, `[NET] connecting …`, LED **blue** |
| **0:32** | **Hotspot ON** (20 s por) | "Hotspot on again, at 32 seconds." | Phone, stopwatch |
| ≤ 1:02 | Opekkha | "Reconnected in **N** seconds, without restarting." | `[NET] Wi-Fi reconnected IP=…`, `[NET] server reconnected`, LED **sobuj** |
| ~1:10 | `up=` dekhao | "Uptime kept counting: **N** seconds, no restart." | `up=` ager theke beshi |
| ~1:20 | Records page dekhao (laptop abar internet pele refresh hobe) | "Records continue; the readings taken while offline arrived with their original times." | Row gulo Δts 5 s, BOOT event nei |

### Clip 2: BOOT 5 s + bhul password (V2), ~2.5 minute

| Stopwatch | Ki korbe | Ki bolbe | Frame e ki dekhabe |
|---|---|---|---|
| 0:00 | Record + stopwatch | "Team T07, Level 02. Test: BOOT button held for 5 seconds, then setup with a wrong password." | Serial, LED sobuj |
| 0:08 | **BOOT button chepe dhoro**, stopwatch dekho | "Holding BOOT… 5 seconds." | Haat BOOT e, stopwatch |
| ~0:14 | Chere dao | "The access point is back." | `[NET] BOOT button held 5 s`, `setup mode: access point SmartClass-T07`, LED **blue** |
| 0:25 | Laptop Wi-Fi te **SmartClass-T07** e connect (password Serial e dekha jacche) | "Joining SmartClass-T07." | Laptop Wi-Fi list |
| 0:45 | Browser e **192.168.4.1** | "This is the setup page: network list with signal strength, password, Room ID and device token." | Setup page, network list |
| 1:00 | Hotspot select, **bhul password** (`12345678`), Room ID `R-305` thakbe, token khali | "Wrong password on purpose." | Form |
| 1:10 | **Save and connect** chapo | "Saved at 1:10." | Stopwatch |
| ≤ 1:25 | Opekkha | "Back in setup mode within 15 seconds, with the error on the page." | Page e **lal error: wrong password**, Serial e `[NET] setup error: …` |
| 1:35 | **Thik password** dao → Save | "Now the right password." | |
| ~1:50 | Opekkha | "Connected." | Page e **Connected! IP …**, Serial `Wi-Fi connected`, LED sobuj |
| 2:00 | Laptop ke abar hotspot e nao | | |

### Clip 3: Backend 20 s bondho (V3), ~2.5 minute

Render free plan e **Resume** korle server chalu hote **30–90 s** lage. Tai "30 s er moddhe" ta **server abar Live howar muhurto theke** gunbe. Video te Render e **"Live"** dekhano gurutto purno.

| Stopwatch | Ki korbe | Ki bolbe | Frame e ki dekhabe |
|---|---|---|---|
| 0:00 | Record + stopwatch | "Team T07, Level 02. Test: backend stopped for 20 seconds." | Records page ONLINE, Serial `up=` |
| 0:10 | Render tab → **fastrobox-t07** → upor dane **"Suspend Web Service"** | "Stopping the backend now." | Render page |
| ~0:20 | Serial dekhao | "Device can't reach the server; it keeps the readings and is not restarting." | `[NET] server not reachable … retrying`, LED **blue**, `up=` barche |
| **0:30** | **"Resume Web Service"** chapo (20 s por) | "Backend started again at 30 seconds." | Render page |
| ~? | Render e **Live** hole stopwatch time bolo | "Server is live at **N**." | Render "Live" |
| ≤ Live + 30 s | Serial dekhao | "Device reconnected to the server by itself." | `[NET] server reconnected` |
| +10 s | Records page refresh | "Records resume; the readings from while it was down are stored too, with their original times. No reset: uptime kept counting, no new BOOT event." | Notun row, Δts 5 s, BOOT nei, log e ONLINE |

---

## Part E: Write-up er screenshot (record er somoy ba pore, `Win + Shift + S`)

1. Serial: `setup mode: access point SmartClass-T07 password=…` (AP password)
2. Setup page (network list + fields)
3. Setup page e **error**
4. Serial: `[NET] Wi-Fi connected IP=… mDNS=http://smartclass-t07.local`
5. **Local status page** (IP diye ar `.local` diye)
6. Serial: `Wi-Fi disconnected` → `Wi-Fi reconnected`, `up=` soho
7. Serial: `server not reachable` → `server reconnected`
8. **Records page:** proti 5 s e row (Δts), CARD_TAP + BOOT events, ONLINE/OFFLINE log
9. **Replay test button er result:** 409, rows with this seq = 1

Measured value gulo note koro:
- Reconnect time (V1)
- Error ashar time (V2)
- Records resume time (V3)
- OFFLINE hote koto s (A6)
- Local page update ≤ 2 s

---

## Part F: Common vul

| Vul | Thik kora |
|---|---|
| Hotspot off kore 20 s er age ON | Stopwatch dekhe **≥ 20 s** (22 s rakho) |
| Video te uptime dekhano hoyni | Off er **age** ar reconnect er **pore** `up=` porishkar dekhao |
| Clip 2 te board restart hocche bole bhoy | BOOT 5 s e restart **hobe e**, eta expected. Proof hocche AP ferot asha. |
| Clip 3 e Render resume deri | "Live" howar time bolo, tar theke 30 s gunbe |
| Laptop setup page e atke ache, internet nai | Clip 2 sesh e laptop ke hotspot e ferot nao |
| Edit kora | **Kokhono na.** Vul hole puro clip notun kore. |

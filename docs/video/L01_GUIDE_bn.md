# Level 1: Puro Guide (Bangla)
**Dual-Core Tasks, Health and Watchdog: 35 marks**

---

## Part A: Level 1 ki?

**Scenario:** Classroom er safety device ek sathe onek kaj kore, kintu kokhono **atke (freeze) jabe na**. Kono part atke gele device **nije restart** hobe ar bolbe **keno** restart holo.

### Requirement gulo, ar amader firmware e kivabe kora

| # | Question paper e ki chay | Amader firmware e kivabe kora | Kivabe check korbe |
|---|---|---|---|
| 1 | FreeRTOS task, **dui core e**, kothao blocking wait na | 6 ta task: **core 1** e `main`, `indicator`, `dht`, `flame`; **core 0** e `rfid`, `sys` | `tasks` command |
| 2 | LED **2 Hz** (250 ms on, 250 ms off), Safe hole **sobuj** | `indicator` task proti 10 ms e LED control kore | LED dekho |
| 3 | DHT11 **5 s**, flame **100 ms**, RFID **200 ms** por por pora; card **ek tap e ek line**, dhore rakhleo | `dht` 5000 ms, `flame` 100 ms, `rfid` 200 ms. Card sorano na porjonto notun line ashe na. | 3 tap + 5 s hold = **4 line** |
| 4 | Proti **1 second** e `[STATUS]` line, fixed format e; command: `help status health tasks ver hang` | `main` task proti 1 s e line print kore, ar command shone | Serial Monitor |
| 5 | **Watchdog:** task atke gele 10 s er moddhe restart; boot e `[EVENT] BOOT reason=...` | Watchdog 8 s. Reason: POWER_ON / SOFTWARE / WATCHDOG / CRASH / BROWNOUT | `hang` → restart → `reason=WATCHDOG` |
| 6 | Start-up e **age flame check**: flame na → door LOCKED, flame → UNLOCKED | `setup()` e sobar age flame pore door set kore | Lighter dhore RST |
| 7 | Sensor khule gele `[ERROR] SENSOR ERROR: <name>`, LED **magenta**, baki sob cholbe. DHT11 **12 s** er moddhe, RFID **3 s** er moddhe. Lagale nije clear. | DHT: por por 2 ta read fail hole (≤ 10 s). RFID: 1 s dhore version register bhul ashle (~1 s). | Tar khulo ar lagao |

### `[STATUS]` line er proti field er mane
```
[STATUS] up=742s T=29.0C RH=64% HI=- flame=0 door=LOCKED state=SAFE trend=- rssi=- heap=290k psram=8000k chip=41.5C fw=1.0.0
```
| Field | Mane |
|---|---|
| `up` | Board chalu howar por koto second |
| `T`, `RH` | DHT11 er temperature, humidity |
| `HI` | Heat index: Level 3 e ashbe, tai ekhon `-` |
| `flame` | 1 = flame dekhche, 0 = na |
| `door` | LOCKED / UNLOCKED |
| `state` | SAFE (Warning/Danger/Fire Level 3 e ashbe) |
| `trend` | Rising/Stable/Falling: Level 3 e ashbe, tai `-` |
| `rssi` | Wi-Fi signal: Level 2 e ashbe, tai `-` |
| `heap`, `psram` | Free memory (KB) |
| `chip` | ESP32 chip er nijer temperature |
| `fw` | Firmware version |

Rule e ache: **je level ekhono banano hoyni, tar field `-` dekhabe**.

---

## Part B: Judges live e ki korbe (Judges' Checklist, Round A)

| Row | Judge ki korbe | Pass korte ki dekhte hobe |
|---|---|---|
| **A1** | 10 s LED dekhbe. Card 3 bar tap korbe, tarpor 5 s dhore rakhbe. Tarpor `health`, `tasks`. | LED niyomito 2 Hz. **Exactly 4 ta** `[CARD]` line. `health` e sob value. `tasks` e **≥ 3 task, dui core**. |
| **A2** | `hang` | **10 s er moddhe** nije restart, `[EVENT] BOOT reason=WATCHDOG`, door `LOCKED` |

Judge **spot check** e video er test ta (sensor khola) live o korte bolte pare. Tai video ar live, dutoi perfect hote hobe.

---

## Part C: Video te ki lagbe (Judges' Checklist, Evidence Check)

**Level 1 er video te sudhu EKTA item:**
> DHT11 er **DATA** tar ar RC522 er **SDA** tar **15 second** khule rakha:
> - RFID er `SENSOR ERROR` **≤ 3 s**
> - DHT11 er `SENSOR ERROR` **≤ 12 s**
> - **Magenta** LED
> - **Freeze hoy na**
> - Lagale **dutoi clear**

**Sob video te ja thakte hobe (na thakle level 0):**
- [ ] **≥ 720p** (1080p e record koro), **clear audio**
- [ ] Shurute ekjon bolbe **Team ID ar Level**
- [ ] **Serial Monitor** dekha jabe
- [ ] Timed jinish er jonno **dekha jay emon clock/stopwatch**
- [ ] **≤ 10 minute**, **≤ 3 clip**, **edit/cut chhara**
- [ ] File er nam: `T07_L01_video.mp4` (T07 er jaygay amader Team ID)

Write-up e ja lagbe (video te na): `[STATUS]` line er screenshot, read period (5 s / 100 ms / 200 ms), ar start-up e flame thakle UNLOCKED.

---

## Part D: Frame e ki thakbe

```
 ┌──────────────────────────── PHONE CAMERA FRAME (landscape, 1080p) ─────────────────────────────┐
 │                                                                                               │
 │   ┌──────────────── LAPTOP SCREEN ───────────────────┐                                        │
 │   │  SERIAL MONITOR (bam ordhek)  │  STOPWATCH (dan) │                                        │
 │   │  font 20, timestamp ON        │                  │                                        │
 │   │  11:02:05 -> [STATUS] up=...  │    00:12.45      │                                        │
 │   │  11:02:06 -> [ERROR] SENSOR.. │   (boro number)  │                                        │
 │   └───────────────────────────────────────────────────┘                                        │
 │                                                                                               │
 │        [ BOARD: LED upore dike ]   [ DHT11 ]   [ RC522 ]     ← laptop er thik samne table e     │
 │          ↑ LED clear dekha jabe     ↑ DATA tar   ↑ SDA tar      dui tar haat diye dhorar moto   │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Frame e obossoi thakbe:**
1. **Serial Monitor:** lekha pora jabe emon boro
2. **Stopwatch:** puro clip e cholte thakbe
3. **Board er RGB LED:** sobuj → magenta → sobuj, rong bojha jabe
4. **DHT11 er DATA tar** ar **RC522 er SDA tar:** khola ar lagano dekha jabe
5. **Tomar haat**, jokhon tar khulcho ar lagaccho

**Frame e thakbe na / korbe na:**
- Haat diye LED ba screen dheke felo na
- Screen e onno window ba notification
- Camera nariye felo na (tripod use koro)

---

## Part E: Step by step

### STEP 1: Laptop screen ready
1. Board cholche, Serial Monitor khola (115200, New Line).
2. **File → Preferences → Editor font size = 20 → OK**.
3. Serial Monitor er upor dan e **ghori (🕐) icon** e click koro, timestamp on hobe.
4. Browser e stopwatch kholo: https://www.online-stopwatch.com/full-screen-stopwatch/
5. Arduino IDE te **Win + ←** (bam ordhek), browser e **Win + →** (dan ordhek).
6. Laptop er **notification off** koro: Windows e Focus / Do not disturb.

✅ Sesh: bam e boro font + timestamp soho Serial Monitor, dan e boro stopwatch.

### STEP 2: Board ar tar ready
1. Board laptop er **samne** rakho, **LED upore** dike.
2. **DHT11 er DATA tar** (GPIO 1) ar **RC522 er SDA tar** (GPIO 41) emon bhabe rakho jate **ek sathe dui haat diye** khola jay. Tar gulo board er pin e **halka kore** lagano thakbe, jate tan dilei khule ashe.
3. LED **sobuj blink** korche kina dekho.

✅ Sesh: board samne, dui tar haater kache, LED sobuj.

### STEP 3: Phone (camera) ready
1. Phone **landscape** e (shuye) **tripod** e lagao. Na thakle boi diye dar koriye rakho.
2. Camera setting: **1080p, 30fps**.
3. Phone e **Do Not Disturb / Airplane mode** on koro, jate call ba notification na ashe.
4. Frame milao (Part D er moto): **screen + board + dui tar** ek sathe dekha jabe.
5. Camera te **zoom kore dekho**: Serial Monitor er lekha pora jacche? LED er rong bojha jacche?
   - Screen e alo bounce korle (glare) phone ektu angle e rakho.
   - LED er rong bojha na gele amake bolo, brightness bariye dibo.

✅ Sesh: phone e 1080p, frame e sob ache, lekha pora jay.

### STEP 4: Practice (record chhara)
Part F er script ta **record chhara 2 bar** koro:
- Stopwatch reset kore chalu koro.
- Dui tar khulo, **≥ 15 second** rakho, abar lagao.
- Dekho: RFID error ≤ 3 s, DHT error ≤ 12 s, magenta, `status` command e reply, lagale dutoi `CLEARED`, sobuj.

✅ Sesh: 2 bar e kono vul nei.

### STEP 5: Record
1. Phone e **record** chapo.
2. Part F er script **ek take e** koro.
3. Vul hole thamo, **notun kore** record koro. Edit kora jabe na.

### STEP 6: Video check
- [ ] Puro video ekbar dekho
- [ ] Shurute Team ID + Level bola ache
- [ ] Serial Monitor er lekha pora jay (zoom kore dekho)
- [ ] Stopwatch sob somoy dekha jacche
- [ ] LED: sobuj → magenta → sobuj dekha jay
- [ ] Audio shona jay
- [ ] Length ≤ 10 minute, resolution ≥ 720p
- [ ] Video er **koto second e** ki holo note koro (write-up er table e lagbe)

### STEP 7: Screenshot (write-up er jonno)
Recording er age ba pore Serial Monitor er screenshot nao (**Win + Shift + S**):
1. `[STATUS]` line gulo, timestamp soho, jate proti second e ashche bojha jay
2. `health` reply
3. `tasks` reply (dui core)
4. `[CARD]` line (3 tap + hold = 4 line)
5. `hang` → `BOOT reason=WATCHDOG`
6. `SENSOR ERROR: RFID`, `SENSOR ERROR: DHT11`, ar dui ta `CLEARED`
7. Flame dhore RST → `door=UNLOCKED`

### STEP 8: Save
- File er nam dao `T07_L01_video.mp4` (Team ID boshiye).
- Screenshot gulo ekta folder e rakho: `evidence/L01/`. Eta GitHub e jabe na, `.gitignore` e ache.

---

## Part F: Video script (ek clip, ~1.5 minute)

| Stopwatch | Ki korbe | Ki bolbe (English e bolo, chhoto kore) | Screen e ki dekhabe |
|---|---|---|---|
| 0:00 | Stopwatch chalu, phone record chalu | "Team **T07**, Level **01**: Dual-Core Tasks, Health and Watchdog. Sensor-error test." | `[STATUS]` line proti second, LED **sobuj** |
| 0:08 | LED er dike angul dekhao | "Device is running normally: green heartbeat." | LED sobuj blink |
| 0:12 | **Dui haat diye DHT11 DATA ar RC522 SDA ek sathe khulo** | "Unplugging the DHT11 data wire and the RC522 SDA wire now, at **12 seconds**." | Haat, tar, stopwatch |
| ~0:13 | Opekkha koro | "RFID sensor error, within 3 seconds." | `[ERROR] SENSOR ERROR: RFID`, LED **magenta** |
| ~0:20 | Keyboard e `status` likhe Enter | "The device is not frozen: it still answers commands." | `[STATUS]` cholche + reply |
| ≤ 0:24 | Opekkha koro | "DHT11 sensor error, within 12 seconds." | `[ERROR] SENSOR ERROR: DHT11` |
| **0:30** | **15+ second hoyeche**, dui tar **abar lagao** | "Reconnecting both wires at 30 seconds." | Haat, tar |
| ~0:31 | Opekkha koro | "RFID cleared." | `SENSOR ERROR CLEARED: RFID` |
| ≤ 0:36 | Opekkha koro | "DHT11 cleared. Back to green." | `SENSOR ERROR CLEARED: DHT11`, LED **sobuj** |
| ~0:40 | Card ekbar tap koro | "Card reader works again." | `[CARD] uid=4113050A` |
| ~0:45 | Record bondho | "End of Level 01 video." | |

**DHT11 er clear hote 5 s porjonto lagte pare**, karon proti 5 s e ekbar pora hoy. Dhoirjo dhoro, line ashar por record bondho koro.

---

## Part G: Common vul

| Vul | Thik kora |
|---|---|
| Tar khular por **15 second er age** lagano | Stopwatch dekhe **≥ 15 s** opekkha koro (amra 18 s rakhbo) |
| Ek tar khule, onno ta pore khola | **Ek sathe dui haat diye** khulo |
| Serial Monitor er lekha choto | Font 20, phone kache, zoom kore check |
| LED er rong video te bojha jay na | Amake bolo, brightness bariye dibo |
| Autoscroll off, notun line dekha jay na | Serial Monitor e **autoscroll on** rakho |
| Video te Team ID bola hoyni | Prothom 5 second ei bolo |
| Edit / cut kora | **Kokhono na.** Vul hole notun kore record koro. |

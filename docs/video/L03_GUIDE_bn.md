# Level 3 guide (Bangla): test, video, write-up
**Heat, Fire, Panic and Fail-Safe Door: 50 marks**

## Part A: Firmware e ki ache

| Requirement | Kivabe | Kothay dekhbe |
|---|---|---|
| Ekta overall status: SAFE / WARNING / DANGER | Notun status **3 s** dhore thakle tobei bodlay. Proti bodle `[EVENT] STATUS old->new`. | Serial `state=`, LED, local page, records events |
| Warning | **≥ 32 °C ba ≥ 85 % RH** → holud. Chare **≤ 30 °C AND ≤ 80 % RH** te. | |
| Danger | **≥ 40 °C** → lal heartbeat + proti 2 s e beep. Chare **≤ 38 °C** e (tokhon Warning). | |
| Heat door bodlay na | Door sudhu fire/reset e bodlay | `door=` |
| Heat index | NOAA (Rothfusz) formula | `HI=…C`, local page, telemetry `heat_index_c` |
| Data quality | Read fail, ba T 0–50 / RH 20–90 er baire → `quality=bad`. Status ager ta thake, reading use hoy na. | local page "Data quality", telemetry `quality` |
| Trend | Last 10 reading er slope. ≥ +0.05 °C/reading = RISING, ≤ −0.05 = FALLING. LED/buzzer/door bodlay na. | `trend=`, local page |
| FIRE | Flame **2 s continuous** (300 ms er kom flicker gap o "continuous") → **sathe sathe** FIRE: flash e save, door **UNLOCKED**, 5 Hz lal, buzzer cholte thake, `FIRE` event | Serial, LED, local page "FIRE – EVACUATE", records |
| Power cut e fire | Fire latch flash e thake → restart e door **UNLOCKED** | |
| Silence | Sudhu **Teacher tag**. Student card kokhono na.<br>• **Fire:** flame jaoar **1.5 s por**, door UNLOCKED e thake.<br>• **Panic / Danger beep:** Teacher tag tap korlei sathe sathe bondho (Danger e LED lal e thake; notun Danger hole abar beep). | `SILENCED` event; flame thakle local page e "CANNOT SILENCE – FLAME PRESENT" |
| Reset fire | Records page e **Reset fire** button (pore Level 4 dashboard) → `FIRE_CLEARED`, door LOCKED | |
| Panic | Touch wire **2 s** → PANIC (lal/blue, 100/100 ms buzzer 10 s, `PANIC` event). < 1 s e kichu hoy na. Baseline start-up e mapa hoy. | Serial `touch-pad baseline=…`, local page PANIC |

**LED priority (kom number jete):** 1 Fire > 2 Panic > 5 Danger > 6 Sensor error > 9 Warning > 10 Offline/blue > 11 Safe/green

---

## Part B: Prothombar ekbar koro

1. `smartclass_L3.zip` upload koro. **Upload ar start-up er somoy touch wire dhorbe na.**
2. Serial e likho **`teacher`**, tarpor **key tag** (`216DE766`) tap koro → `saved as Teacher tag`. Ekbar korlei hoy, flash e thake.
3. **Touch check:** wire na dhore likho `touch`, tarpor wire dhore abar `touch`.
   - Dhorle **ratio > 1.25** hote hobe.
   - Na hole amake dui bar er number pathao, threshold bodle dibo.
4. **Flame sensor tune:** lighter/moombati **30 cm** dure dhore module er DO-LED jole kina dekho. Na jolle blue screw dhire ghurao.

---

## Part C: Judge er live test (Round A)

### A5: Fire + Teacher silence
| # | Ki korbe | ✅ Pass |
|---|---|---|
| 1 | Moombati/lighter 30 cm dure **≥ 3 s** | ~2 s e `[EVENT] FIRE …`, buzzer cholte thake, lal **fast** blink, `door=UNLOCKED`, `state=FIRE`; records e `FIRE` **3 s er moddhe** |
| 2 | Flame **thaka obosthay** key tag tap | `CANNOT SILENCE - FLAME PRESENT` (Serial + local page), buzzer **cholte thake** |
| 3 | Flame nibhao, **student card** (`4113050A`) tap | `not a Teacher tag`, buzzer cholte thake |
| 4 | **Key tag** tap | `[EVENT] SILENCED …`, buzzer bondho, **door UNLOCKED e thake**, LED lal blink cholte thake |

### A6: Power cut during fire + Reset fire
| # | Ki korbe | ✅ Pass |
|---|---|---|
| 5 | Fire thaka obosthay USB **40 s** khulo, tarpor lagao | Records **OFFLINE** → ONLINE, `BOOT` event; Serial e `fire latch restored`, `door=UNLOCKED` |
| 6 | Records page e **Reset fire** | ~1–2 s e `[CMD] from platform: reset_fire`, `[EVENT] FIRE_CLEARED …`, `door=LOCKED`, `state=SAFE`, LED sobuj |

### A7: Panic
| # | Ki korbe | ✅ Pass |
|---|---|---|
| 7 | Touch wire er matha **3 s** dhoro | 2 s e `[EVENT] PANIC`, lal/blue, buzzer, local page **PANIC**; records e **3 s er moddhe** |

---

## Part D: Video items (Judges' Checklist, Level 3)

Sob clip e: shurute "Team T07, Level 03", Serial Monitor + **local page** + stopwatch frame e.

| Clip | Ki dekhate hobe | Kivabe |
|---|---|---|
| **V1: Hair dryer** | Danger porjonto garom, tarpor thanda: **holud**, tarpor **lal + 2 s e beep**. HI ar trend dekhay. **FIRE hoy na, door bodlay na.** **Exactly ekta** DANGER→WARNING ar ekta WARNING→SAFE, ar SAFE sudhu **≤ 30 °C** e. | Dryer **20–30 cm dure**, low heat. DHT ke **41–45 °C** e nao, **50 °C er beshi na** (tahole quality bad hoye jabe). Flame sensor er dike dryer tak koro na. Tarpor dryer bondho kore thanda hote dao (fan diye hawa dite paro). Serial e STATUS event gulo dekhao. |
| **V2: Flick + short touch** | Moombati flame sensor er samne diye **~1 s** jhapta, ar touch pad **< 1 s**: **kichui hoy na** | Stopwatch frame e rakho |
| **V3: Gentle warming** | Trend **RISING**, LED/buzzer/door bodlay na | Haat diye DHT11 dheke ba ektu dure dryer: **32 °C er niche** thako. ~30–40 s por `trend=RISING`. |
| **V4: DHT unplugged during Warning** | `quality` **bad**, status **SAFE e name na** | Age Warning e nao (≥ 32 °C), tarpor DHT DATA tar khulo. LED magenta hobe (sensor error), kintu `state=WARNING` thakbe, local page e quality **bad**. |

Video V1 te **dryer er garom hawa flame sensor e lagle IR flame sensor bhul kore FIRE dhorte pare**. Flame sensor ke DHT theke dure rakho, ba dryer onno dik theke dao.

---

## Part E: Write-up e lagbe (screenshot + lekha)
- Thresholds (32/40, RH 85/80), 3 s hold, hysteresis (38/30), heat-index formula
- Fire latch (flash e, door UNLOCKED, power cut e o)
- Teacher-tag silence rule, fail-safe door logic
- Touch-pad calibration (start-up baseline + 1.25× threshold), baseline er Serial screenshot
- Screenshots: STATUS events, `HI=`/`trend=` status line, FIRE / SILENCED / FIRE_CLEARED / PANIC events (Serial + records), local page (FIRE – EVACUATE, PANIC, CANNOT SILENCE, quality bad)

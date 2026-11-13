# Wiring Guide: FastRobox kit

Checked against the real kit photo. The board is an **"ESP32-S3 WROOM"** with module **ESP32-S3-N16R8** (16 MB flash, 8 MB octal PSRAM) and an **OV3660** camera (not an OV2640). The pin layout matches the Freenove ESP32-S3-WROOM CAM board.

## 1. Kit parts

| Part | Pins on the part | Notes |
|---|---|---|
| ESP32-S3 WROOM board | 2 × 20 header pins, 2 USB-C, RST + BOOT buttons, RGB LED "48" | Camera already plugged into the ribbon connector |
| DHT11 module (blue, 3 pins) | `VCC` `DATA` `GND` | Has its own pull-up resistor and power LED |
| IR flame module (3 pins) | `VCC` `GND` `DO` | Blue potentiometer = sensitivity. `DO-LED` lights when it sees flame. |
| RC522 RFID (HW-126) | `SDA` `SCK` `MOSI` `MISO` `IRQ` `GND` `RST` `3.3V` | **3.3 V only. Never 5 V.** |
| Active buzzer (2 legs) | `+` (longer leg / "+" mark on top) and `−` | Sounds by itself when given 3.3 V |
| Jumper wires | | Female-female for module ↔ board. One wire with a bare end = panic pad. |

## 2. Connections

All modules are powered from the board's **3V3** pin (not 5V). This keeps every signal at 3.3 V, which is safe for the ESP32-S3. Use the GND pins on both header rows.

| From (part pin) | To (board pin) | Wire colour (suggested) |
|---|---|---|
| RC522 `3.3V` | **3V3** | red |
| RC522 `GND` | **GND** | black |
| RC522 `SDA` (chip select) | **GPIO 41** | yellow |
| RC522 `SCK` | **GPIO 47** | orange |
| RC522 `MOSI` | **GPIO 21** | green |
| RC522 `MISO` | **GPIO 42** | blue |
| RC522 `RST` | **GPIO 40** | white |
| RC522 `IRQ` | *not connected* | |
| DHT11 `VCC` | **3V3** | red |
| DHT11 `GND` | **GND** | black |
| DHT11 `DATA` | **GPIO 1** | yellow |
| Flame `VCC` | **3V3** | red |
| Flame `GND` | **GND** | black |
| Flame `DO` | **GPIO 39** | purple |
| Buzzer `+` | **GPIO 38** | orange |
| Buzzer `−` | **GND** | black |
| Panic pad (one wire, far end bare) | **GPIO 14** | any. Keep it short. |

The 3V3 pin is needed by three modules but there is only one 3V3 pin. You may not use a breadboard, so here are two ways to share it:
- Twist the bare ends of jumper wires together and insulate them with tape.
- Use the RC522's spare header pins as a junction: the 3.3 V pin on the RC522 board is connected straight through to the module.

Do the same for GND, or use the separate GND pins on each header row.

```
            ESP32-S3 WROOM (camera side up, USB at the bottom)
   left header                               right header
   3V3 ──► RC522 3.3V / DHT VCC / Flame VCC   TX
   EN                                        RX
   4  (camera)                               1  ◄── DHT11 DATA
   5  (camera)                               2  (onboard LED)
   6  (camera)                               42 ◄── RC522 MISO
   7  (camera)                               41 ◄── RC522 SDA
   15 (camera)                               40 ◄── RC522 RST
   16 (camera)                               39 ◄── Flame DO
   17 (camera)                               38 ──► Buzzer +
   18 (camera)                               37 (PSRAM - do not use)
   8  (camera)                               36 (PSRAM - do not use)
   3                                         35 (PSRAM - do not use)
   46                                        0  (BOOT button)
   9  (camera)                               45
   10 (camera)                               48 (RGB LED)
   11 (camera)                               47 ◄── RC522 SCK
   12 (camera)                               21 ◄── RC522 MOSI
   13 (camera)                               20 (USB D+)
   14 ◄── panic pad wire                     19 (USB D-)
   5V                                        GND ── all module GNDs
   GND ── buzzer −
```

### Pins we must not use
- **GPIO 4–13 and 15–18:** camera.
- **GPIO 35–37:** PSRAM inside the module.
- **GPIO 19 and 20:** USB.
- **GPIO 0, 3, 45 and 46:** strapping pins, read at boot.
- **GPIO 48:** RGB LED.
- **GPIO 43 and 44:** the TX/RX serial pins.

## 3. Safety checks before plugging in USB

1. Nothing is connected to **5V** (the flame module on 5 V would put 5 V on GPIO 39).
2. RC522 `3.3V` goes to **3V3**, not 5V.
3. Every module's GND goes to a board GND.
4. No bare metal is touching another pin. The panic-pad end must not touch the board.
5. The camera ribbon is fully inserted and the latch is closed.

## 4. Self-test (first thing to run)

The project is in `firmware/selftest`. Install **VS Code + the PlatformIO extension**, open the `firmware/selftest` folder, then:

```bash
pio run -e uart -t upload
```

```bash
pio device monitor -b 115200
```

**Which USB-C port to use:** one port goes to the USB-to-serial chip and the other is the native USB.
- If the Serial Monitor stays empty after upload, move the cable to the other port and use `-e usb` instead of `-e uart`.
- If upload fails, hold **BOOT**, tap **RST**, then release **BOOT** and upload again.

At start-up it runs every test once. A good result looks like this (version and values vary):

```
[INFO] flash=16MB psram=8192KB ... -> OK
[DHT] OK T=29.0C RH=64%
[FLAME] DO=1 -> no flame
[RFID] version=0x92 OK (tap the card or key tag now)
[TOUCH] value=... baseline=... ratio=1.00 -> not touched
[CAM] sensor PID=0x3660 (OV3660)
[CAM] capture OK 640x480 JPEG ... bytes
```

Then type `watch` and try each part:

| Do this | Expect |
|---|---|
| Tap the card, then the key tag | One `[CARD] uid=...` line per tap plus a short beep. Write down both UIDs. |
| Hold the card on the reader | Still only one line (it is not repeated) |
| Hold the bare wire end | `touch=...(1.5x+)`. Note the ratio and use it to set the panic threshold. |
| Lighter or candle about 30 cm from the flame sensor (outdoors or a safe place; judges use their own candle on the day) | `flame=1`, module's DO-LED on. If not, turn the blue potentiometer slowly until the DO-LED **just** turns off with no flame. |
| Breathe on the DHT11 | RH goes up |
| Unplug DHT11 DATA | `T=ERR`. Plug back in → values return |
| Unplug RC522 SDA | `rfid=ERR`. Plug back in → `OK` |

If a test fails, check the wire for that part against the table in section 2. Every value printed here goes into the Level 1 write-up (wiring diagram + measured values).

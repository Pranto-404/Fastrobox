# FastRobox — Unified GPIO wiring map (Team 07)

**Use this revision, rather than earlier pin diagrams. This mapping is proposed for the photographed ESP32-S3-CAM with two USB connectors and on-board WS2812 RGB LED. Verify each label on the real board before applying power.**

## RC522 (SPI)
- SDA / SS → GPIO41
- SCK → GPIO47
- MOSI → GPIO39
- MISO → GPIO21
- RST → GPIO42
- 3.3V → 3V3; GND → GND; IRQ → unconnected

Previously reported wiring: GPIO2(SDA), GPIO47(SCK), GPIO48(MOSI), GPIO21(MISO), GPIO3(RST). **Change only SDA→41, MOSI→39 and RST→42.** Leave SCK and MISO, and power connections as reported *if verified correct*.

## DHT11
- DATA / S → GPIO14 (three-pin module shown: use printed S/+/- labels, NOT physical order)
- VCC / + → 3V3
- GND / - → GND

## Flame detector (3-pin module)
- DO → GPIO38
- VCC → 3V3
- GND → GND
- Firmware default assumes active LOW. Confirm with an instrument/readings before flame testing.

## Reserved for Level 3
- Active buzzer + → GPIO2, - → GND, **ONLY if rated for 3.3V and its current draw is within safe ESP32-S3 GPIO drive limits**. Otherwise do not connect directly; get an organizer-approved safe solution.
- Touch panic electrode → GPIO1 (open metal end of permitted jumper, do not join to supply).
- On-board WS2812 RGB LED → GPIO48 (no jumper needed).

## Safety and conflicts
- **Unplug USB before moving or plugging any jumper.**
- **No microSD card** while GPIO38 and GPIO39 are used.
- Camera uses GPIO4–13 and 15–18; PSRAM reserves GPIO35–37; native USB uses GPIO19/20.
- ESP32 GPIOs are 3.3V only, never attach 5V output to a GPIO.
- Only one accessible 3V3 pin may be present; distributing it to RC522, DHT11 and flame module must be done using an organizer-approved, adequately insulated jumper distribution, **not dangling exposed wire twists or disallowed breadboards**. If safe distribution is not possible, ask the organizers before powering up.
- This is a connection plan: nothing is judged as passed until tested on the actual board.

## Firmware
Arduino source: `firmware/level01_full/Fastrobox_Level1.ino`

### Test sequence
1. Test on-board RGB blink without sensors.
2. Wire + verify RC522 and read card UID once per tap.
3. Wire DHT11 and check non-NaN 5s readings.
4. Wire flame sensor and test with approved judge-controlled procedure only.
5. Test unplug/replug error recovery with USB off before moving wires unless the live unplug test is administered safely by judges per contest instructions.
6. Test watchdog `hang` and `health`, `tasks`, `ver`, `status` commands.

**Do not falsely report this source as fully compile-tested or judge-passed.**

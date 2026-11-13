# Fastrobox

Official version-controlled workspace for the Fastrobox hackathon project.

## Repository status

- **Project:** Fastrobox
- **Competition:** FastRobox 1.0 Grand Finale
- **Default branch:** `main`
- **Current stage:** ESP32-S3 USB serial bring-up sketch committed. Board and peripherals have **not yet** been physically verified.

## Immediate hardware test

1. Install Arduino IDE 2 and `esp32 by Espressif Systems` boards package.
2. Connect the ESP32-S3-CAM by a data-capable USB cable.
3. Select `ESP32S3 Dev Module` for the initial test and enable `USB CDC On Boot` (if provided).
4. Open `firmware/bringup/usb_serial_test/usb_serial_test.ino` and upload.
5. Open Serial Monitor at **115200 baud** with **Newline** and verify the output: `[TEST] FASTROBOX USB SERIAL OK`.
6. Type `ping` and press Enter: expect `[TEST] PONG`. Type `health` and verify heap, PSRAM and core count.

This sketch is a **USB communication diagnostic, not a completed Level 1 implementation**. Do not wire sensors or assume GPIO pin numbers until the exact board revision and pinout are confirmed.

## Version-control workflow

- Keep `main` stable, with small descriptive commits and traceable history.
- Use feature branches for risky changes; tag tested, judged firmware only after real tests.
- Never commit passwords, Wi-Fi credentials, device tokens, cloud secrets, or face photos.
- Keep README and documentation aligned with observed hardware and test results.

## Local clone

```bash
git clone https://github.com/Pranto-404/Fastrobox.git
cd Fastrobox
```

## Notes

One ESP32-S3-CAM board and only organizer-provided electronic components may be used. Consult the participant question paper and judge's physical checklist for the requirements and evidence for each of the 12 sequential levels.

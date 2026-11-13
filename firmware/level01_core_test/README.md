# Level 1 — Stage A (core / LED / watchdog test)

**Status:** Source committed; NOT compiled on or tested with the participant's hardware by this assistant. Not a completed Level 1.

## Prerequisites
- The USB serial test in `firmware/bringup/usb_serial_test` must already pass.
- Arduino IDE: Boards Manager → `esp32 by Espressif Systems`; board `ESP32S3 Dev Module`.
- Install `Adafruit NeoPixel` by Adafruit in Library Manager.
- Open `level01_core_test.ino`; choose previously working board settings/port.
- Keep external sensors **disconnected** for this stage.
- GPIO48 is common for the on-board WS2812 LED on two-USB-C ESP32-S3-CAM boards; confirm on the board's printed model/pinout if it does not blink. Do NOT connect anything externally to GPIO48.
- Serial Monitor: **115200 baud**, line ending **Newline**.

## Expected test sequence
1. Upload: `[TEST] FASTROBOX LEVEL 1 STAGE A START`, three FreeRTOS tasks across cores 0 and 1.
2. Check the on-board RGB LED blinks green: 250 ms ON / 250 ms OFF, i.e., a 2 Hz full cycle.
3. Check `[STATUS]` appears once per second. T/RH/flame and door explicitly say **unverified** because sensors are not yet connected.
4. Type `health` and check chip, core count, flash, heap, PSRAM, temperature, reset reason.
5. Type `tasks` and check statusTask/core0, ledTask/core1, cmdTask/core1.
6. Type `ver` and `status`.
7. **Only after saving the Serial Monitor screenshot**, type `hang`: it should trigger a watchdog reboot in about six seconds and print a new BOOT event. If `watchdog subscription` or `watchdog config` is not `ESP_OK`, do not claim this part passed.

## Still required for the actual Level 1
- Verified external sensor wiring for this exact board revision.
- DHT11 read each 5 seconds, flame each 100 ms, RFID each 200 ms.
- Real RFID de-duplication and held-card behavior.
- DHT11 / RFID unplug fault detection and recovery.
- Startup flame check, proper door state, complete measured [STATUS] fields.
- Actual timed test and required video, write-up, screenshots and Git tag.

No judge-grade claims until measured on the real board.

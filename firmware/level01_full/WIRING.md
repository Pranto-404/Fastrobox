# FastRobox L1: Team 07 wiring revision (2026-11-13)

The participant reported RC522 SDA=GPIO2, SCK=GPIO47, MOSI=GPIO48, MISO=GPIO21, RST=GPIO3, GND=GND, 3.3V=3V3.

**With USB unplugged, change exactly two RC522 signal wires:**
- MOSI from **GPIO48** to **GPIO39**: GPIO48 is reserved for the onboard RGB LED.
- RST from **GPIO3** to **GPIO42**: GPIO3 is a strapping pin and could affect startup.

**Keep other RC522 connections as they are:** SDA/SS=GPIO2, SCK=GPIO47, MISO=GPIO21, GND=GND, VCC=3V3, IRQ unconnected. Note: GPIO2 may have a separate auxiliary on-board LED. Test SPI communication for reliability; if it causes interference, move SDA/SS to GPIO41 and change PIN_RFID_SS accordingly.

For the future complete Level 1 sensor wiring:
- DHT11 DATA=GPIO1, 3V3 and GND.
- Flame sensor DO=GPIO38, 3V3 and GND.
- Onboard RGB uses GPIO48.
- Do not insert microSD while using these SPI pins.

Corresponding firmware: `Fastrobox_Level1.ino` in this directory; candidate source must still be compiled and tested on the real board.

No board may be rewired with USB/power connected. Confirm actual module silk-screen and avoid unsafe, uninsulated power wire splices.

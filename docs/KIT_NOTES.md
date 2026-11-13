# Kit notes (measured on our kit)

Reference values for testing only. **The firmware never hard-codes these**: cards and the Teacher tag are registered at run time.

| Item | Value | Notes |
|---|---|---|
| Board | ESP32-S3-N16R8, OV3660 camera | 16 MB flash, 8 MB OPI PSRAM |
| Serial port | COM5 on the team laptop (USB-UART port) | USB CDC On Boot = Disabled |
| RC522 version register | `0x82` (clone chip) | Firmware accepts the version read at boot; 0x00/0xFF = wiring fault |
| Kit card | UID `4113050A` (MIFARE 1KB) | Student card in tests |
| Kit key tag | UID `216DE766` (MIFARE 1KB) | Teacher tag in tests |
| Touch ratio when held | *(to measure)* | Sets the panic threshold |

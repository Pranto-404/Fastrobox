#pragma once
// FastRobox SmartClass firmware: build-time configuration.
// Nothing here is a secret. Wi-Fi, Room ID and device token come from the setup page (Level 2).

#ifndef FW_VERSION
#define FW_VERSION "1.0.0"
#endif

#ifndef TEAM_ID
#define TEAM_ID "T00"  // set the real Team ID with -DTEAM_ID="T07" (PlatformIO) or edit here
#endif

// ---- Pins (see docs/WIRING.md) ----
#define PIN_RFID_SCK   47
#define PIN_RFID_MOSI  21
#define PIN_RFID_MISO  42
#define PIN_RFID_SS    41   // RC522 "SDA"
#define PIN_RFID_RST   40
#define PIN_DHT        1
#define PIN_FLAME      39   // LOW = flame
#define PIN_BUZZER     38
#define PIN_TOUCH      14
#define PIN_RGB_LED    48
#define PIN_BOOT_BTN   0

// ---- Periods (Level 1 requirements) ----
#define DHT_PERIOD_MS        5000   // DHT11 every 5 s
#define FLAME_PERIOD_MS      100    // flame every 100 ms
#define RFID_PERIOD_MS       200    // RFID every 200 ms
#define STATUS_PERIOD_MS     1000   // [STATUS] every 1 s
#define SYS_PERIOD_MS        1000   // chip temperature / heap snapshot
#define SIGNAL_PERIOD_MS     10     // LED + buzzer pattern resolution

// ---- Sensor-error rules ----
#define DHT_FAILS_FOR_ERROR  2      // 2 failed reads in a row (<= 10 s) -> error (limit 12 s)
#define RFID_FAILS_FOR_ERROR 5      // 5 bad version reads (1 s) -> error (limit 3 s)
#define CARD_ABSENT_POLLS    2      // card must be gone 2 polls (400 ms) before a new tap counts

// ---- Watchdog ----
#define WDT_TIMEOUT_S        8      // a frozen task restarts the board in ~8 s (limit 10 s)

#pragma once
// FastRobox SmartClass firmware: build-time configuration.
// Nothing here is a secret. Wi-Fi, Room ID and device token come from the setup page (Level 2).

#ifndef FW_VERSION
#define FW_VERSION "1.0.0"
#endif

#ifndef TEAM_ID
#define TEAM_ID "T07"  // our hackathon Team ID (team "Kemon_dilam_Bondhura"); override with -DTEAM_ID=\"Txx\"
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

// ---- Network (Level 2). The server address is not a secret; the device token is typed on the setup page. ----
#ifndef SERVER_HOST
#define SERVER_HOST          "fastrobox-t07.onrender.com"
#endif
#define SERVER_PORT          443
#define DEVICE_NUMBER        "D1"     // device_id = TEAM_ID-D1, e.g. T07-D1
#define TZ_DHAKA             "<+06>-6" // Asia/Dhaka, UTC+6, no daylight saving
#define TELEMETRY_PERIOD_MS  5000   // telemetry every 5 s (+/- 1 s allowed)
#define SETUP_TRY_MS         13000  // new Wi-Fi details: up to 3 tries in 13 s, then back to setup (limit 15 s)
#define SETUP_MAX_TRIES      3      // phone hotspots often refuse the very first handshake
#define RECONNECT_MAX_GAP_MS 8000   // saved Wi-Fi: retry gaps 1, 2, 4, 8, 8 ... s (reconnects well within 30 s)
#define BOOT_HOLD_MS         5000   // hold BOOT 5 s -> clear Wi-Fi details
#define LIVE_TIMEOUT_MS      15000  // no successful server reply for 15 s -> OFFLINE
#define OUTBOX_CAPACITY      360    // records kept in RAM while the server is unreachable (30 min of telemetry)
#define WEB_VERSION          "3"    // bump when the pages in webfiles.h change

// ---- Classroom safety (Level 3) ----
#define WARN_TEMP_C          32.0f  // enter Warning at >= 32 C (Level 5 makes this a remote setting)
#define DANGER_TEMP_C        40.0f  // enter Danger at >= 40 C
#define HYSTERESIS_C         2.0f   // leave each state 2 C below its limit (Danger 38, Warning 30)
#define WARN_RH              85.0f  // enter Warning at >= 85 % humidity
#define WARN_RH_EXIT         80.0f  // leave Warning only at <= 80 % humidity
#define STATUS_HOLD_MS       3000   // a new status counts after holding 3 s
#define FIRE_HOLD_MS         2000   // flame seen continuously for 2 s -> FIRE at once
#define PANIC_HOLD_MS        2000   // touch held 2 s -> PANIC (shorter than 1 s is ignored)
#define PANIC_ALARM_MS       10000  // panic buzzer pattern for 10 s
#define TOUCH_RATIO          1.25f  // touched when the reading is 25 % above the start-up baseline
#define TREND_READINGS       10     // trend from the last 10 temperature readings
#define TREND_SLOPE_C        0.05f  // C per reading (~0.6 C/min) for Rising / Falling
#define FLAME_GAP_MS         300    // a candle flickers: gaps shorter than this still count as "continuous"
#define FLAME_RECENT_MS      1500   // flame seen this recently = "flame present" for silence / reset
#define TOUCH_GAP_MS         150    // same idea for the touch pad
#define COMMAND_POLL_MS      1000   // ask the server for commands (Reset fire, ...) every second

// ---- Watchdog ----
#define WDT_TIMEOUT_S        8      // a frozen task restarts the board in ~8 s (limit 10 s)

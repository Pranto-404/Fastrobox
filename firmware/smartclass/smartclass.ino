// FastRobox SmartClass firmware (ESP32-S3-N16R8 + OV3660).
// Level 1: dual-core FreeRTOS tasks, [STATUS] every second, serial commands, task watchdog, sensor errors.
// Level 2: Wi-Fi setup access point + page, local status page (LittleFS, mDNS), reconnect, NTP time,
//          HTTPS telemetry every 5 s with server-certificate check, CARD_TAP / BOOT events, seq never reused.
// Level 3: Safe/Warning/Danger with hysteresis + 3 s hold, heat index, trend, quality, fire latch (flash),
//          fail-safe door, Teacher-tag silence, touch panic pad, Reset fire from the platform.
//
// Tasks (see `tasks` command):
//   core 1: main (this loop: console + [STATUS] 1 s), dht (5 s), flame (100 ms), indicator (LED/buzzer 10 ms)
//   core 1: telem (queues telemetry every 5 s)
//   core 0: rfid (200 ms), sys (chip temperature 1 s), wifi (50 ms), web (local pages), uplink (HTTPS to the cloud)
//
// Arduino IDE: board "ESP32S3 Dev Module", esp32 core 2.0.17, Flash 16MB, PSRAM "OPI PSRAM",
// USB CDC On Boot "Disabled" (COM port). Libraries: MFRC522 (GithubCommunity), DHT sensor library for ESPx.

#include "config.h"
#include "shared.h"
#include "sensors.h"
#include "indicator.h"
#include "console.h"
#include "settings.h"
#include "outbox.h"
#include "telemetry.h"
#include "wifinet.h"
#include "web.h"
#include "uplink.h"
#include "safety.h"
#include "esp_task_wdt.h"
#include "esp_arduino_version.h"

void setup() {
  Serial.begin(115200);
  delay(300);

  // Task watchdog: any subscribed task that stops checking in for WDT_TIMEOUT_S restarts the board.
  // The API changed between Arduino-ESP32 2.x (ESP-IDF 4.4) and 3.x (ESP-IDF 5).
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  esp_task_wdt_config_t wdt = {};
  wdt.timeout_ms = WDT_TIMEOUT_S * 1000;
  wdt.idle_core_mask = 0;
  wdt.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&wdt) != ESP_OK) esp_task_wdt_init(&wdt);
#else
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif

  settingsBegin();
  outboxBegin();
  char reason[32];
  snprintf(reason, sizeof(reason), "reason=%s", resetReasonName());
  emitEvent("BOOT", reason);  // prints "[EVENT] BOOT reason=..." and sends it to the cloud
  logf("[STATUS] SmartClass fw=%s team=%s", FW_VERSION, TEAM_ID);
  if (!psramFound()) logf("[ERROR] PSRAM not found: set Tools > PSRAM > \"OPI PSRAM\" and upload again");
  withState([](DeviceState &s) { s.chipTempC = temperatureRead(); });  // first [STATUS] line shows a real value

  // Level 1, task 6: check the flame sensor first. No flame -> door LOCKED, flame -> door UNLOCKED.
  bool flame = readFlameAtStartup();
  withState([&](DeviceState &s) {
    s.flame = flame;
    s.doorUnlocked = flame;
  });
  safetyBegin();  // a fire latched before a power cut keeps the door UNLOCKED
  logf("[EVENT] DOOR %s (flame at start-up: %s)", stateSnapshot().doorUnlocked ? "UNLOCKED" : "LOCKED",
       flame ? "yes" : "no");

  startIndicatorTask();
  startSensorTasks();
  startSafetyTasks();
  startTelemetryTask();
  startWifiTask();
  startWebTask();
  startUplinkTask();

  registerTask(xTaskGetCurrentTaskHandle(), "main", xPortGetCoreID(), STATUS_PERIOD_MS);
  enableLoopWDT();  // the main task (this loop) is watched too: `hang` freezes it on purpose
}

void loop() {
  static uint32_t nextStatus = millis();
  pollConsole();
  if ((int32_t)(millis() - nextStatus) >= 0) {
    nextStatus += STATUS_PERIOD_MS;
    printStatusLine();
  }
  vTaskDelay(pdMS_TO_TICKS(10));  // let other tasks run; the console is checked every 10 ms
}

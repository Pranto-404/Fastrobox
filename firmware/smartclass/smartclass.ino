// FastRobox SmartClass firmware (ESP32-S3-N16R8 + OV3660).
// Level 1: dual-core FreeRTOS tasks, [STATUS] every second, serial commands, task watchdog, sensor errors.
//
// Tasks (see `tasks` command):
//   core 1: main (this loop: console + [STATUS] 1 s), dht (5 s), flame (100 ms), indicator (LED/buzzer 10 ms)
//   core 0: rfid (200 ms), sys (chip temperature 1 s)        [Wi-Fi/network tasks join core 0 in Level 2]
//
// Arduino IDE: board "ESP32S3 Dev Module", esp32 core 2.0.17, Flash 16MB, PSRAM "OPI PSRAM",
// USB CDC On Boot "Disabled" (COM port). Libraries: MFRC522 (GithubCommunity), DHT sensor library for ESPx.

#include "config.h"
#include "shared.h"
#include "sensors.h"
#include "indicator.h"
#include "console.h"
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

  logf("[EVENT] BOOT reason=%s", resetReasonName());
  logf("[STATUS] SmartClass fw=%s team=%s", FW_VERSION, TEAM_ID);

  // Level 1, task 6: check the flame sensor first. No flame -> door LOCKED, flame -> door UNLOCKED.
  bool flame = readFlameAtStartup();
  withState([&](DeviceState &s) {
    s.flame = flame;
    s.doorUnlocked = flame;
  });
  logf("[EVENT] DOOR %s (flame at start-up: %s)", flame ? "UNLOCKED" : "LOCKED", flame ? "yes" : "no");

  startIndicatorTask();
  startSensorTasks();

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

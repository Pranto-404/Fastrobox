/*
 FastRobox Level 1 — Stage A: dual-core / RGB / serial / watchdog bring-up.
 Real sensors are NOT connected or simulated in this sketch.
 Judges' printed checklist: 115200 baud, 2 Hz RGB, health/tasks/hang.
 This is NOT the complete Level 1 submission.
*/
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>
#include <string.h>

#ifndef RGB_GPIO
#define RGB_GPIO 48  // Verified for several ESP32-S3-CAM two-USB variants; confirm yours.
#endif

Adafruit_NeoPixel rgb(1, RGB_GPIO, NEO_GRB + NEO_KHZ800);
TaskHandle_t statusHandle = nullptr;
TaskHandle_t ledHandle = nullptr;
TaskHandle_t cmdHandle = nullptr;
SemaphoreHandle_t serialLock = nullptr;
volatile bool hangRequested = false;
uint32_t lastStatusMs = 0;

const char *resetName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON: return "POWER_ON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "CRASH_OR_WATCHDOG";
    case ESP_RST_INT_WDT: return "WATCHDOG";
    case ESP_RST_TASK_WDT: return "WATCHDOG";
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "OTHER";
  }
}

void statusLine() {
  xSemaphoreTake(serialLock, portMAX_DELAY);
  // No DHT11, RFID or flame readings are produced until real sensors are wired.
  Serial.printf("[STATUS] up=%lus T=- RH=- HI=- flame=- door=UNVERIFIED state=BRINGUP "
                "trend=- rssi=- heap=%luk psram=%luk chip=%.1fC fw=0.1.0-core\n",
                (unsigned long)(millis()/1000),
                (unsigned long)(ESP.getFreeHeap()/1024),
                (unsigned long)(ESP.getFreePsram()/1024),
                temperatureRead());
  xSemaphoreGive(serialLock);
}

void ledTask(void *) {
  bool on = false;
  for (;;) {
    on = !on;
    rgb.setPixelColor(0, on ? rgb.Color(0, 40, 0) : 0);
    rgb.show();
    vTaskDelay(pdMS_TO_TICKS(250)); // 250ms on + 250ms off = 2Hz heartbeat
  }
}

void statusTask(void *) {
  esp_err_t err = esp_task_wdt_add(nullptr);
  xSemaphoreTake(serialLock, portMAX_DELAY);
  Serial.printf("[TEST] watchdog subscription=%s\n", esp_err_to_name(err));
  xSemaphoreGive(serialLock);
  for (;;) {
    if (!hangRequested) esp_task_wdt_reset();
    // hang command deliberately stops feeding this subscribed task.
    if (millis() - lastStatusMs >= 1000) {
      lastStatusMs = millis();
      statusLine();
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

void printCommands() {
  Serial.println("[CMD] help | status | health | tasks | ver | hang");
}
void processCommand(const char *s) {
  xSemaphoreTake(serialLock, portMAX_DELAY);
  if (strcmp(s, "help") == 0) {
    printCommands();
  } else if (strcmp(s, "health") == 0) {
    Serial.printf("[CMD] chip=%s cores=%d cpu=%dMHz uptime=%lus\n",
                  ESP.getChipModel(), ESP.getChipCores(), getCpuFrequencyMhz(),
                  (unsigned long)(millis()/1000));
    Serial.printf("[CMD] free_heap=%lu free_psram=%lu flash=%lu chip_temp=%.1fC\n",
                  (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getFreePsram(),
                  (unsigned long)ESP.getFlashChipSize(), temperatureRead());
    Serial.printf("[CMD] reset_reason=%s fw=0.1.0-core wifi_rssi=N/A\n",
                  resetName(esp_reset_reason()));
  } else if (strcmp(s, "tasks") == 0) {
    Serial.printf("[CMD] statusTask core=0 free_stack=%lu\n",
                  (unsigned long)uxTaskGetStackHighWaterMark(statusHandle));
    Serial.printf("[CMD] ledTask core=1 free_stack=%lu\n",
                  (unsigned long)uxTaskGetStackHighWaterMark(ledHandle));
    Serial.printf("[CMD] cmdTask core=1 free_stack=%lu\n",
                  (unsigned long)uxTaskGetStackHighWaterMark(cmdHandle));
  } else if (strcmp(s, "ver") == 0) {
    Serial.printf("[CMD] fw=0.1.0-core build=%s %s\n", __DATE__, __TIME__);
  } else if (strcmp(s, "status") == 0) {
    Serial.println("[CMD] immediate status follows");
  } else if (strcmp(s, "hang") == 0) {
    Serial.println("[CMD] hang requested: watchdog should reboot within ~6s");
    Serial.flush();
    hangRequested = true;
  } else if (*s) {
    Serial.printf("[CMD] unknown command: %s\n", s);
  }
  xSemaphoreGive(serialLock);
  if (strcmp(s, "status") == 0) statusLine();
}

void commandTask(void *) {
  char input[48] = {};
  size_t used = 0;
  for (;;) {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\r') continue;
      if (c == '\n') {
        input[used] = 0;
        processCommand(input);
        used = 0;
      } else if (used < sizeof(input) - 1) {
        input[used++] = c;
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void setup() {
  Serial.begin(115200);
  uint32_t until = millis() + 3000;
  while (!Serial && millis() < until) delay(10);
  serialLock = xSemaphoreCreateMutex();
  rgb.begin();
  rgb.setBrightness(45);
  rgb.clear();
  rgb.show();

  Serial.println("\n[TEST] FASTROBOX LEVEL 1 STAGE A START");
  Serial.printf("[EVENT] BOOT reason=%s\n", resetName(esp_reset_reason()));
  Serial.printf("[TEST] flash=%lu psram=%lu rgb_pin=%d\n",
                (unsigned long)ESP.getFlashChipSize(),
                (unsigned long)ESP.getPsramSize(), RGB_GPIO);

#if ESP_IDF_VERSION_MAJOR >= 5
  esp_task_wdt_config_t wdtCfg = {};
  wdtCfg.timeout_ms = 6000;
  wdtCfg.idle_core_mask = 0;
  wdtCfg.trigger_panic = true;
  esp_err_t wdtErr = esp_task_wdt_init(&wdtCfg);
  if (wdtErr == ESP_ERR_INVALID_STATE) wdtErr = esp_task_wdt_reconfigure(&wdtCfg);
#else
  esp_err_t wdtErr = esp_task_wdt_init(6, true);
#endif
  Serial.printf("[TEST] watchdog config=%s\n", esp_err_to_name(wdtErr));

  xTaskCreatePinnedToCore(statusTask, "statusTask", 4096, nullptr, 2, &statusHandle, 0);
  xTaskCreatePinnedToCore(ledTask, "ledTask", 4096, nullptr, 2, &ledHandle, 1);
  xTaskCreatePinnedToCore(commandTask, "cmdTask", 4096, nullptr, 2, &cmdHandle, 1);
  Serial.println("[TEST] 3 FreeRTOS tasks started across both cores.");
  Serial.println("[TEST] Sensors are NOT tested in Stage A.");
  printCommands();
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000));
}

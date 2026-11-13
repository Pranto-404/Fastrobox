#include "telemetry.h"
#include "shared.h"
#include "outbox.h"
#include "esp_task_wdt.h"

static void telemetryTask(void *) {
  esp_task_wdt_add(NULL);
  vTaskDelay(pdMS_TO_TICKS(3000));  // first reading after the DHT11 has been read once
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    queueTelemetry();
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(TELEMETRY_PERIOD_MS));
  }
}

void startTelemetryTask() {
  TaskHandle_t h;
  xTaskCreatePinnedToCore(telemetryTask, "telem", 4096, nullptr, 2, &h, 1);
  registerTask(h, "telem", 1, TELEMETRY_PERIOD_MS);
}

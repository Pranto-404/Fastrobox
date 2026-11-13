#include "indicator.h"
#include "shared.h"
#include "esp_task_wdt.h"

struct Rgb {
  uint8_t r, g, b;
};

// Colours from the Device Signals table (brightness kept low; the LED is very bright).
static const Rgb GREEN = {0, 40, 0};
static const Rgb MAGENTA = {40, 0, 40};

// Level 1 states: Sensor error (6) beats Safe (11). Later levels add more states here.
static Rgb currentColour(const DeviceState &s) {
  if (s.dhtError || s.rfidError) return MAGENTA;
  return GREEN;
}

static void indicatorTask(void *) {
  esp_task_wdt_add(NULL);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  Rgb shown = {1, 1, 1};  // force the first write
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    DeviceState s = stateSnapshot();
    bool on = (millis() % 500) < 250;  // 2 Hz heartbeat: 250 ms on, 250 ms off
    Rgb want = on ? currentColour(s) : Rgb{0, 0, 0};
    if (want.r != shown.r || want.g != shown.g || want.b != shown.b) {
      neopixelWrite(PIN_RGB_LED, want.r, want.g, want.b);
      shown = want;
    }
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(SIGNAL_PERIOD_MS));
  }
}

void startIndicatorTask() {
  TaskHandle_t h;
  xTaskCreatePinnedToCore(indicatorTask, "indicator", 3072, nullptr, 4, &h, 1);
  registerTask(h, "indicator", 1, SIGNAL_PERIOD_MS);
}

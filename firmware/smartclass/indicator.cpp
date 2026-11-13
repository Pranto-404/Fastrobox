#include "indicator.h"
#include "shared.h"
#include "esp_task_wdt.h"

struct Rgb {
  uint8_t r, g, b;
};

// Colours from the Device Signals table (brightness kept low; the LED is very bright).
static const Rgb GREEN = {0, 40, 0};
static const Rgb MAGENTA = {40, 0, 40};
static const Rgb BLUE = {0, 0, 50};
static const Rgb RED = {60, 0, 0};
static const Rgb YELLOW = {45, 30, 0};
static const Rgb OFF = {0, 0, 0};

// Device Signals table: the lowest-numbered active state is shown.
//  1 Fire: red 5 Hz flashing, buzzer 200/200 ms continuous (until silenced)
//  2 Panic: red/blue alternating, buzzer 100/100 ms for 10 s
//  5 Heat Danger: red 2 Hz heartbeat, one short beep every 2 s
//  6 Sensor error: magenta 2 Hz       9 Warning: yellow 2 Hz
// 10 Wi-Fi setup / offline: blue 2 Hz   11 Safe: green 2 Hz
static void signals(const DeviceState &s, uint32_t t, Rgb &led, bool &buzz) {
  bool beat = (t % 500) < 250;  // 2 Hz heartbeat
  buzz = false;
  if (s.fire) {
    led = (t % 200) < 100 ? RED : OFF;
    buzz = !s.silenced && (t % 400) < 200;
  } else if (s.panic) {
    led = (t % 500) < 250 ? RED : BLUE;
    buzz = (t % 200) < 100;
  } else if (s.heatStatus == 2) {
    led = beat ? RED : OFF;
    buzz = (t % 2000) < 120;
  } else if (s.dhtError || s.rfidError) {
    led = beat ? MAGENTA : OFF;
  } else if (s.heatStatus == 1) {
    led = beat ? YELLOW : OFF;
  } else if (s.setupMode || !s.serverLive) {
    led = beat ? BLUE : OFF;
  } else {
    led = beat ? GREEN : OFF;
  }
}

static void indicatorTask(void *) {
  esp_task_wdt_add(NULL);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  Rgb shown = {1, 1, 1};  // force the first write
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    DeviceState s = stateSnapshot();
    Rgb want;
    bool buzz;
    signals(s, millis(), want, buzz);
    digitalWrite(PIN_BUZZER, buzz ? HIGH : LOW);
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

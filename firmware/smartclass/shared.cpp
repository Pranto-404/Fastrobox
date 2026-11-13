#include "shared.h"
#include <stdarg.h>
#include "esp_system.h"

SemaphoreHandle_t gStateMutex = xSemaphoreCreateMutex();
DeviceState gState;
static SemaphoreHandle_t logMutex = xSemaphoreCreateMutex();

DeviceState stateSnapshot() {
  xSemaphoreTake(gStateMutex, portMAX_DELAY);
  DeviceState copy = gState;
  xSemaphoreGive(gStateMutex);
  return copy;
}

void logf(const char *fmt, ...) {
  char buf[256];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  // Wait at most 50 ms so a busy Serial port can never freeze a task.
  if (xSemaphoreTake(logMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    Serial.println(buf);
    xSemaphoreGive(logMutex);
  }
}

struct TaskInfo {
  TaskHandle_t handle;
  const char *name;
  int core;
  uint32_t periodMs;
};
static TaskInfo tasks[12];
static int taskCount = 0;

void registerTask(TaskHandle_t h, const char *name, int core, uint32_t periodMs) {
  if (taskCount < 12) tasks[taskCount++] = {h, name, core, periodMs};
}

void printTasks() {
  logf("[CMD] tasks: %d running", taskCount);
  for (int i = 0; i < taskCount; i++) {
    // On ESP32 the stack high-water mark is reported in bytes.
    logf("[CMD]   %-8s core=%d period=%lums free_stack=%uB", tasks[i].name, tasks[i].core,
         (unsigned long)tasks[i].periodMs, (unsigned)uxTaskGetStackHighWaterMark(tasks[i].handle));
  }
}

const char *resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "POWER_ON";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT:
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_PANIC: return "CRASH";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default: return "POWER_ON";  // external reset pin, deep-sleep wake, unknown
  }
}

uint32_t uptimeSeconds() { return (uint32_t)(esp_timer_get_time() / 1000000ULL); }

const char *deviceId() {
  static char id[16] = "";
  if (!id[0]) snprintf(id, sizeof(id), "%s-%s", TEAM_ID, DEVICE_NUMBER);
  return id;
}

const char *mdnsName() {
  static char name[32] = "";
  if (!name[0]) {
    snprintf(name, sizeof(name), "smartclass-%s", TEAM_ID);
    for (char *c = name; *c; c++) *c = tolower(*c);
  }
  return name;
}

const char *heatStatusName(uint8_t s) { return s == 2 ? "DANGER" : s == 1 ? "WARNING" : "SAFE"; }

const char *overallStatus(const DeviceState &s) { return s.fire ? "FIRE" : heatStatusName(s.heatStatus); }

const char *trendName(const DeviceState &s) {
  if (!s.trendValid) return "STABLE";
  return s.trend > 0 ? "RISING" : s.trend < 0 ? "FALLING" : "STABLE";
}

#pragma once
// State shared between tasks, guarded by one mutex, plus thread-safe logging and a task registry.
#include <Arduino.h>
#include "config.h"

struct DeviceState {
  // DHT11
  bool dhtHasReading = false;  // at least one good reading so far
  float tempC = 0;
  float rh = 0;
  bool dhtError = false;
  // Flame
  bool flame = false;
  // RFID
  bool rfidError = false;
  char lastUid[24] = "";
  // Door (Level 1: set once at start-up from the flame sensor)
  bool doorUnlocked = false;
  // System snapshot (sysTask)
  float chipTempC = 0;
  // Network (Level 2)
  char roomId[32] = "";
  bool setupMode = false;      // own access point + setup page active
  bool wifiConnected = false;
  bool serverLive = false;     // last server reply within LIVE_TIMEOUT_MS
  int rssi = 0;
  char ip[16] = "";
  uint16_t pending = 0;        // records waiting to be sent
};

// "T07-D1"
const char *deviceId();
// "smartclass-t07"
const char *mdnsName();

// Copy of the state, taken under the mutex.
DeviceState stateSnapshot();
// Run a short block of code with the state locked: withState([](DeviceState &s){ s.flame = true; });
template <typename F> void withState(F fn);

// Thread-safe printf to the Serial Monitor (one whole line at a time).
void logf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));

// Task registry for the `tasks` command.
void registerTask(TaskHandle_t h, const char *name, int core, uint32_t periodMs);
void printTasks();

// Start-up information.
const char *resetReasonName();
uint32_t uptimeSeconds();

// ---- implementation detail for withState ----
extern SemaphoreHandle_t gStateMutex;
extern DeviceState gState;
template <typename F> void withState(F fn) {
  xSemaphoreTake(gStateMutex, portMAX_DELAY);
  fn(gState);
  xSemaphoreGive(gStateMutex);
}

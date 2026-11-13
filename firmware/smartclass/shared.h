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
  bool flame = false;          // raw reading (every 100 ms)
  uint32_t lastFlameMs = 0;    // millis() of the last reading that saw flame
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
  // Safety (Level 3)
  uint32_t dhtReads = 0;       // increases on every good DHT11 reading
  uint8_t heatStatus = 0;      // 0 SAFE, 1 WARNING, 2 DANGER (after the 3 s hold)
  bool qualityGood = false;    // every reading trustworthy
  bool hiValid = false;
  float heatIndex = 0;
  int8_t trend = 0;            // -1 FALLING, 0 STABLE, 1 RISING
  bool trendValid = false;
  bool fire = false;           // fire latched (kept in flash)
  bool silenced = false;
  bool panic = false;          // panic alarm sounding
  bool dangerSilenced = false; // Teacher tag stopped the Danger beep (until the status leaves Danger)
  uint32_t touchBaseline = 0;
  char notice[48] = "";        // short message for the local page, e.g. CANNOT SILENCE
  uint32_t noticeUntil = 0;
};

const char *heatStatusName(uint8_t s);
const char *overallStatus(const DeviceState &s);  // FIRE / DANGER / WARNING / SAFE
const char *trendName(const DeviceState &s);

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

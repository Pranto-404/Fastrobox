#include "outbox.h"
#include "shared.h"
#include "settings.h"

static Record *ring = nullptr;
static uint16_t head = 0, count = 0;
static SemaphoreHandle_t mtx = xSemaphoreCreateMutex();
static TaskHandle_t wake = nullptr;

bool clockValid() { return time(nullptr) > 1700000000; }

void outboxBegin() {
  size_t bytes = sizeof(Record) * OUTBOX_CAPACITY;
  ring = (Record *)(psramFound() ? ps_malloc(bytes) : malloc(bytes));
}

void outboxSetNotify(TaskHandle_t t) { wake = t; }

static void push(const Record &r) {
  if (!ring) return;
  xSemaphoreTake(mtx, portMAX_DELAY);
  if (count == OUTBOX_CAPACITY) {  // full: drop the oldest so the newest data is kept
    head = (head + 1) % OUTBOX_CAPACITY;
    count--;
    logf("[ERROR] outbox full, oldest record dropped");
  }
  ring[(head + count) % OUTBOX_CAPACITY] = r;
  count++;
  uint16_t c = count;
  xSemaphoreGive(mtx);
  withState([&](DeviceState &s) { s.pending = c; });
  if (wake) xTaskNotifyGive(wake);
}

static void stamp(Record &r) {
  memset(&r, 0, sizeof(r));
  r.seq = nextSeq();
  r.takenMs = millis();
  r.ts = clockValid() ? (uint32_t)time(nullptr) : 0;
  DeviceState s = stateSnapshot();
  strlcpy(r.room, s.roomId, sizeof(r.room));
}

void queueTelemetry() {
  DeviceState s = stateSnapshot();
  if (!s.roomId[0]) return;  // not set up yet: nothing to report to
  Record r;
  stamp(r);
  r.isEvent = false;
  r.uptimeS = uptimeSeconds();
  r.hasTH = s.dhtHasReading && !s.dhtError;
  r.tempC = s.tempC;
  r.rh = s.rh;
  r.flame = s.flame;
  r.unlocked = s.doorUnlocked;
  r.qualityGood = r.hasTH;
  r.rssi = s.wifiConnected ? s.rssi : 0;
  r.heapKb = ESP.getFreeHeap() / 1024;
  r.chipC = s.chipTempC;
  push(r);
}

void emitEvent(const char *type, const char *detail) {
  logf("[EVENT] %s %s", type, detail);
  Record r;
  stamp(r);
  r.isEvent = true;
  strlcpy(r.type, type, sizeof(r.type));
  strlcpy(r.detail, detail, sizeof(r.detail));
  push(r);
}

bool outboxPeek(Record &r) {
  xSemaphoreTake(mtx, portMAX_DELAY);
  bool ok = count > 0;
  if (ok) r = ring[head];
  xSemaphoreGive(mtx);
  return ok;
}

void outboxPop() {
  xSemaphoreTake(mtx, portMAX_DELAY);
  if (count) {
    head = (head + 1) % OUTBOX_CAPACITY;
    count--;
  }
  uint16_t c = count;
  xSemaphoreGive(mtx);
  withState([&](DeviceState &s) { s.pending = c; });
}

uint16_t outboxCount() { return count; }

bool recordToJson(const Record &r, char *out, size_t len) {
  uint32_t ts = r.ts;
  if (!ts) {
    if (!clockValid()) return false;
    ts = (uint32_t)time(nullptr) - (millis() - r.takenMs) / 1000;  // time it was really taken
  }
  // The room is filled in at send time if the record was made before set-up finished.
  const char *room = r.room[0] ? r.room : stateSnapshot().roomId;
  if (r.isEvent) {
    snprintf(out, len, "{\"device_id\":\"%s\",\"room_id\":\"%s\",\"seq\":%lu,\"ts\":%lu,\"type\":\"%s\",\"detail\":\"%s\"}",
             deviceId(), room, (unsigned long)r.seq, (unsigned long)ts, r.type, r.detail);
  } else {
    char t[12] = "null", h[12] = "null", rs[8] = "null";
    if (r.hasTH) {
      snprintf(t, sizeof(t), "%.1f", r.tempC);
      snprintf(h, sizeof(h), "%.0f", r.rh);
    }
    if (r.rssi) snprintf(rs, sizeof(rs), "%d", r.rssi);
    snprintf(out, len,
             "{\"device_id\":\"%s\",\"room_id\":\"%s\",\"seq\":%lu,\"ts\":%lu,\"uptime_s\":%lu,\"temp_c\":%s,\"rh\":%s,"
             "\"heat_index_c\":null,\"flame\":%s,\"door\":\"%s\",\"status\":\"SAFE\",\"heat_trend\":null,\"rssi\":%s,"
             "\"heap_kb\":%u,\"chip_temp_c\":%.1f,\"fw\":\"%s\",\"quality\":\"%s\"}",
             deviceId(), room, (unsigned long)r.seq, (unsigned long)ts, (unsigned long)r.uptimeS, t, h,
             r.flame ? "true" : "false", r.unlocked ? "UNLOCKED" : "LOCKED", rs, r.heapKb, r.chipC, FW_VERSION,
             r.qualityGood ? "good" : "bad");
  }
  return true;
}

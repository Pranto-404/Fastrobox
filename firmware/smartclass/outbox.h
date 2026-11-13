#pragma once
// Outbox: every telemetry reading and event is queued here with its seq and the time it was taken,
// then sent oldest-first by the uplink task. A record leaves the outbox only after the server
// answered 201 (stored) or 409 (already stored), so nothing is lost or stored twice.
#include <Arduino.h>

struct Record {
  bool isEvent;
  uint32_t seq;
  uint32_t takenMs;    // millis() when taken (used to work out ts if the clock was not set yet)
  uint32_t ts;         // Unix time when taken, 0 = not known yet
  char room[32];
  // event
  char type[20];
  char detail[64];
  // telemetry
  uint32_t uptimeS;
  bool hasTH;
  float tempC, rh;
  bool flame, unlocked, qualityGood;
  int16_t rssi;
  uint16_t heapKb;
  float chipC;
};

void outboxBegin();
void outboxSetNotify(TaskHandle_t task);  // the uplink task is woken when a record is queued
void queueTelemetry();
void emitEvent(const char *type, const char *detail);  // prints "[EVENT] <type> <detail>" and queues it
bool outboxPeek(Record &r);
void outboxPop();
uint16_t outboxCount();
bool clockValid();
// Builds the fixed-format JSON. Returns false if the time is still unknown.
bool recordToJson(const Record &r, char *out, size_t len);

#include "sensors.h"
#include "shared.h"
#include <SPI.h>
#include <MFRC522.h>
#include <DHTesp.h>
#include "esp_task_wdt.h"
#include "outbox.h"
#include "safety.h"

static DHTesp dht;
static MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
static byte rfidBootVersion = 0;  // the version read at start-up (0x82 on our kit's clone chip)

static bool knownRfidVersion(byte v) {
  return v == 0x82 || v == 0x88 || v == 0x90 || v == 0x91 || v == 0x92 || v == 0xB2;
}

// ---------- DHT11: every 5 s, core 1 ----------
static void dhtTask(void *) {
  esp_task_wdt_add(NULL);
  dht.setup(PIN_DHT, DHTesp::DHT11);
  vTaskDelay(pdMS_TO_TICKS(1500));  // DHT11 needs ~1 s after power-up
  int fails = 0;
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    TempAndHumidity v = dht.getTempAndHumidity();
    bool ok = dht.getStatus() == DHTesp::ERROR_NONE && !isnan(v.temperature) && !isnan(v.humidity);
    if (ok) {
      bool wasError = false;
      withState([&](DeviceState &s) {
        wasError = s.dhtError;
        s.tempC = v.temperature;
        s.rh = v.humidity;
        s.dhtHasReading = true;
        s.dhtError = false;
        s.dhtReads++;
      });
      if (wasError) logf("[ERROR] SENSOR ERROR CLEARED: DHT11");
      fails = 0;
    } else if (++fails == DHT_FAILS_FOR_ERROR) {
      withState([](DeviceState &s) { s.dhtError = true; });
      logf("[ERROR] SENSOR ERROR: DHT11");
      emitEvent("SENSOR_ERROR", "DHT11");
    }
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(DHT_PERIOD_MS));
  }
}

// ---------- Flame: every 100 ms, core 1 ----------
static void flameTask(void *) {
  esp_task_wdt_add(NULL);
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    bool flame = digitalRead(PIN_FLAME) == LOW;
    uint32_t now = millis();
    withState([&](DeviceState &s) {
      s.flame = flame;
      if (flame) s.lastFlameMs = now;
    });
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(FLAME_PERIOD_MS));
  }
}

// ---------- RFID: every 200 ms, core 0 ----------
// A tap is reported once: the card must be absent for CARD_ABSENT_POLLS polls before it can count again,
// so a card held on the reader gives exactly one [CARD] line.
static void rfidTask(void *) {
  esp_task_wdt_add(NULL);
  int badVersion = 0;
  int absentPolls = CARD_ABSENT_POLLS;  // start "absent" so the first tap counts
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    bool readerOk = rfidBootVersion ? (v == rfidBootVersion) : knownRfidVersion(v);
    bool isError = stateSnapshot().rfidError;

    if (!readerOk) {
      if (++badVersion == RFID_FAILS_FOR_ERROR) {
        withState([](DeviceState &s) { s.rfidError = true; });
        logf("[ERROR] SENSOR ERROR: RFID");
        emitEvent("SENSOR_ERROR", "RFID");
      }
    } else {
      if (isError) {
        rfid.PCD_Init();  // re-initialise after the wire comes back
        if (!rfidBootVersion) rfidBootVersion = v;
        withState([](DeviceState &s) { s.rfidError = false; });
        logf("[ERROR] SENSOR ERROR CLEARED: RFID");
      }
      badVersion = 0;

      // WUPA wakes cards even if we halted them earlier, so a held card stays "present".
      byte atqa[2];
      byte atqaSize = sizeof(atqa);
      bool present = rfid.PICC_WakeupA(atqa, &atqaSize) == MFRC522::STATUS_OK && rfid.PICC_ReadCardSerial();
      if (present) {
        if (absentPolls >= CARD_ABSENT_POLLS) {
          char uid[24] = {0};
          for (byte i = 0; i < rfid.uid.size && i < 10; i++) sprintf(uid + i * 2, "%02X", rfid.uid.uidByte[i]);
          withState([&](DeviceState &s) { strlcpy(s.lastUid, uid, sizeof(s.lastUid)); });
          logf("[CARD] uid=%s", uid);
          emitEvent("CARD_TAP", uid);  // sent to the cloud at once
          safetyOnCardTap(uid);         // Teacher tag silence / registration
        }
        absentPolls = 0;
        rfid.PICC_HaltA();
      } else if (absentPolls < CARD_ABSENT_POLLS) {
        absentPolls++;
      }
    }
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(RFID_PERIOD_MS));
  }
}

// ---------- System snapshot: every 1 s, core 0 ----------
static void sysTask(void *) {
  esp_task_wdt_add(NULL);
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    float t = temperatureRead();
    withState([&](DeviceState &s) { s.chipTempC = t; });
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(SYS_PERIOD_MS));
  }
}

bool readFlameAtStartup() {
  pinMode(PIN_FLAME, INPUT);
  int flameCount = 0;
  for (int i = 0; i < 5; i++) {  // 5 samples over ~250 ms
    if (digitalRead(PIN_FLAME) == LOW) flameCount++;
    delay(50);
  }
  return flameCount >= 3;
}

void startSensorTasks() {
  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  if (knownRfidVersion(v)) rfidBootVersion = v;
  else logf("[ERROR] SENSOR ERROR: RFID");
  withState([&](DeviceState &s) { s.rfidError = !knownRfidVersion(v); });

  TaskHandle_t h;
  xTaskCreatePinnedToCore(dhtTask, "dht", 4096, nullptr, 2, &h, 1);
  registerTask(h, "dht", 1, DHT_PERIOD_MS);
  xTaskCreatePinnedToCore(flameTask, "flame", 2048, nullptr, 3, &h, 1);
  registerTask(h, "flame", 1, FLAME_PERIOD_MS);
  xTaskCreatePinnedToCore(rfidTask, "rfid", 4096, nullptr, 2, &h, 0);
  registerTask(h, "rfid", 0, RFID_PERIOD_MS);
  xTaskCreatePinnedToCore(sysTask, "sys", 3072, nullptr, 1, &h, 0);
  registerTask(h, "sys", 0, SYS_PERIOD_MS);
}

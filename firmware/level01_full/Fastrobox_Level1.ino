/*
 * FastRobox 1.0 — Level 1: Dual-Core Tasks, Health and Watchdog
 * ESP32-S3-WROOM-CAM (dual USB-C) — TEAM 07
 *
 * L1 hardware: onboard RGB, DHT11, RC522 RFID, IR flame sensor.
 * Real physical tests are mandatory: the sketch alone is NOT a Level 1 pass.
 * CAUTION: Verify EVERY wire against board & module SILKSCREEN before USB power.
 * This pin map matches the user's current wiring EXCEPT two required moves:
 * RC522 MOSI GPIO48 -> GPIO39 (GPIO48 belongs to on-board RGB LED),
 * RC522 RST GPIO3 -> GPIO42 (GPIO3 is an ESP32-S3 strapping pin).
 * Other RC522 wires remain on GPIO2(SDA),47(SCK),21(MISO).
 * GPIO2 may also drive the on-board auxiliary status LED; verify SPI reliability.
 * This pin map preserves camera pins and assumes no microSD is installed.
 *
 * Arduino IDE / esp32 by Espressif Systems (3.x recommended):
 *   Board ESP32S3 Dev Module; USB CDC On Boot Enabled;
 *   PSRAM OPI PSRAM if board has 8MB; select matching Flash Size.
 * Libraries: Adafruit NeoPixel, DHT sensor library (+ Unified Sensor), MFRC522.
 * Serial Monitor: 115200 baud, Newline.
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <DHT.h>
#include <Adafruit_NeoPixel.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <esp_idf_version.h>
#include <esp_err.h>
#include <math.h>

// ---- Proposed, non-conflicting PIN MAP for photographed board ----
// GPIO38-40 also connect to on-board SD socket: do not insert an SD card.
// GPIO4-13,15-18: camera, GPIO48: RGB, GPIO19/20: USB,
// GPIO35-37: OPI PSRAM. Do not reuse those pins.
#define PIN_RFID_SCK    47
#define PIN_RFID_MISO   21
#define PIN_RFID_MOSI   39
#define PIN_RFID_SS     2     // RC522 pin marked SDA / SS; GPIO2 may share on-board status LED
#define PIN_RFID_RST    42
#define PIN_DHT         1
#define PIN_FLAME       38    // IR module DO; no microSD card
#define PIN_RGB         48
#define FLAME_ACTIVE_LOW 1     // change to 0 only if your flame module requires it

// ---- Judging requirements ----
static const char *FW_VERSION = "1.0.0-L1";
constexpr uint32_t DHT_INTERVAL_MS   = 5000;
constexpr uint32_t FLAME_INTERVAL_MS = 100;
constexpr uint32_t RFID_INTERVAL_MS  = 200;
constexpr uint32_t STATUS_INTERVAL_MS= 1000;
constexpr uint32_t LED_TOGGLE_MS     = 250; // 250 ON + 250 OFF = 2Hz
constexpr uint32_t WDT_TIMEOUT_MS    = 6000; // <10 seconds

DHT dht(PIN_DHT, DHT11);
MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
Adafruit_NeoPixel led(1, PIN_RGB, NEO_GRB + NEO_KHZ800);

TaskHandle_t sensorTaskHandle = nullptr;
TaskHandle_t serialTaskHandle = nullptr;
TaskHandle_t ledTaskHandle = nullptr;
SemaphoreHandle_t serialMutex = nullptr;

volatile float temperatureC = NAN;
volatile float humidityRH = NAN;
volatile bool dhtGood = false;
volatile bool rfidGood = false;
volatile bool flameActive = false;
volatile bool doorUnlocked = false;
volatile bool hangRequested = false;
volatile bool wdtRegistered = false;
volatile uint32_t cardCount = 0;

// STATUS health output and events are serialized across cores.
void printLocked(const String &line) {
  if (xSemaphoreTake(serialMutex, pdMS_TO_TICKS(500)) == pdTRUE) {
    Serial.println(line);
    xSemaphoreGive(serialMutex);
  }
}

const char* getResetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "POWER_ON";
    case ESP_RST_SW:       return "SOFTWARE";
    case ESP_RST_TASK_WDT:
    case ESP_RST_INT_WDT:
    case ESP_RST_WDT:      return "WATCHDOG";
    case ESP_RST_PANIC:    return "CRASH";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    default:              return "OTHER";
  }
}

String uidToString() {
  char uidbuf[4];
  String value;
  for (byte i = 0; i < rfid.uid.size; ++i) {
    snprintf(uidbuf, sizeof(uidbuf), "%02X", rfid.uid.uidByte[i]);
    value += uidbuf;
  }
  return value;
}

String fixedFloat(float v, int digits) {
  return isfinite(v) ? String(v, digits) : String("-");
}

void statusLine() {
  String s = "[STATUS] up=" + String(millis()/1000) + "s";
  s += " T=" + (dhtGood ? fixedFloat(temperatureC,1) + "C" : "-");
  s += " RH=" + (dhtGood ? String((int)round(humidityRH)) + "%" : "-");
  s += " HI=-"; // Implemented in Level 3; never fabricate heat index
  s += " flame=" + String(flameActive ? 1 : 0);
  s += " door=" + String(doorUnlocked ? "UNLOCKED" : "LOCKED");
  s += " state=" + String(flameActive ? "FIRE" : "SAFE");
  s += " trend=- rssi=-";
  s += " heap=" + String(ESP.getFreeHeap()/1024) + "k";
  s += " psram=" + String(ESP.getFreePsram()/1024) + "k";
  s += " chip=" + fixedFloat(temperatureRead(),1) + "C";
  s += " fw=" + String(FW_VERSION);
  printLocked(s);
}

void healthCommand() {
  printLocked("[CMD] chip=" + String(ESP.getChipModel()) +
      " cores=" + String(ESP.getChipCores()) +
      " cpu=" + String(getCpuFrequencyMhz()) + "MHz" +
      " uptime=" + String(millis()/1000) + "s");
  printLocked("[CMD] chip_temp=" + fixedFloat(temperatureRead(),1) + "C" +
      " heap=" + String(ESP.getFreeHeap()) + "B" +
      " free_psram=" + String(ESP.getFreePsram()) + "B" +
      " flash=" + String(ESP.getFlashChipSize()) + "B");
  printLocked("[CMD] wifi_rssi=N/A reset_reason=" + String(getResetReason()) +
      " fw=" + String(FW_VERSION) +
      " dht=" + String(dhtGood ? "OK" : "ERROR") +
      " rfid=" + String(rfidGood ? "OK" : "ERROR") +
      " watchdog=" + String(wdtRegistered ? "ARMED" : "NOT_ARMED"));
}

void tasksCommand() {
  if (sensorTaskHandle) {
    printLocked("[CMD] task=sensors core=" + String(xTaskGetCoreID(sensorTaskHandle)) +
                " stack_free_words=" + String(uxTaskGetStackHighWaterMark(sensorTaskHandle)) +
                " DHT=5s FLAME=100ms RFID=200ms");
  }
  if (ledTaskHandle) {
    printLocked("[CMD] task=led core=" + String(xTaskGetCoreID(ledTaskHandle)) +
                " stack_free_words=" + String(uxTaskGetStackHighWaterMark(ledTaskHandle)) +
                " heartbeat=2Hz");
  }
  if (serialTaskHandle) {
    printLocked("[CMD] task=serial core=" + String(xTaskGetCoreID(serialTaskHandle)) +
                " stack_free_words=" + String(uxTaskGetStackHighWaterMark(serialTaskHandle)) +
                " status=1s");
  }
}

void command(const String &input) {
  String cmd = input;
  cmd.trim(); cmd.toLowerCase();
  if (!cmd.length()) return;
  if (cmd == "help") {
    printLocked("[CMD] help, status, health, tasks, ver, hang");
  } else if (cmd == "status") {
    printLocked("[CMD] requested status");
    statusLine();
  } else if (cmd == "health") {
    healthCommand();
  } else if (cmd == "tasks") {
    tasksCommand();
  } else if (cmd == "ver") {
    printLocked("[CMD] fw=" + String(FW_VERSION) + " built=" + __DATE__ + " " + __TIME__);
  } else if (cmd == "hang") {
    printLocked("[CMD] hang: stopping watchdog feed; board should restart within 10s");
    hangRequested = true;
  } else {
    printLocked("[CMD] unknown: " + cmd + " (type help)");
  }
}

bool isReaderHealthy() {
  // RC522 VersionReg reliably becomes 0x00 or 0xFF if SDA/SS is disconnected.
  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  return version != 0x00 && version != 0xFF;
}

void sensorTask(void *arg) {
  (void)arg;
  dht.begin();
  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  vTaskDelay(pdMS_TO_TICKS(50));

  // Watchdog supervises the sensor worker, not just idle loops.
  esp_err_t sub = esp_task_wdt_add(nullptr);
  wdtRegistered = (sub == ESP_OK);
  printLocked("[TEST] watchdog_register=" + String(esp_err_to_name(sub)));

  uint32_t lastDht = millis() - DHT_INTERVAL_MS;
  uint32_t lastFlame = millis() - FLAME_INTERVAL_MS;
  uint32_t lastRfid = millis() - RFID_INTERVAL_MS;
  bool dhtHasBeenRead = false;
  int rfidBadCount = 0;
  bool readerFaultAnnounced = false;
  bool dhtFaultAnnounced = false;

  for (;;) {
    const uint32_t now = millis();
    if (now - lastFlame >= FLAME_INTERVAL_MS) {
      lastFlame = now;
      bool raw = digitalRead(PIN_FLAME);
      flameActive = FLAME_ACTIVE_LOW ? !raw : raw;
      doorUnlocked = flameActive; // L1 start-up safety; fire latch comes in L3
    }
    if (now - lastDht >= DHT_INTERVAL_MS) {
      lastDht = now;
      float rh = dht.readHumidity();
      float c = dht.readTemperature();
      bool ok = isfinite(rh) && isfinite(c) && rh >= 0 && rh <= 100 && c >= -10 && c <= 60;
      if (ok) {
        temperatureC = c;
        humidityRH = rh;
        if (dhtFaultAnnounced) printLocked("[EVENT] SENSOR_RECOVERED DHT11");
        dhtFaultAnnounced = false;
        dhtGood = true;
      } else {
        dhtGood = false;
        temperatureC = NAN; humidityRH = NAN;
        if (dhtHasBeenRead && !dhtFaultAnnounced) {
          printLocked("[ERROR] SENSOR ERROR: DHT11");
          dhtFaultAnnounced = true;
        }
      }
      dhtHasBeenRead = true;
    }
    if (now - lastRfid >= RFID_INTERVAL_MS) {
      lastRfid = now;
      bool online = isReaderHealthy();
      if (!online) {
        if (++rfidBadCount >= 3) {
          rfidGood = false;
          if (!readerFaultAnnounced) {
            printLocked("[ERROR] SENSOR ERROR: RFID");
            readerFaultAnnounced = true;
          }
        }
      } else {
        rfidBadCount = 0;
        rfidGood = true;
        if (readerFaultAnnounced) {
          printLocked("[EVENT] SENSOR_RECOVERED RFID");
          readerFaultAnnounced = false;
          rfid.PCD_Init();
        }
        // HALT ensures a card held on the reader won't trigger multiple tap lines.
        if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
          cardCount++;
          printLocked("[CARD] uid=" + uidToString() + " count=" + String(cardCount));
          rfid.PICC_HaltA();
          rfid.PCD_StopCrypto1();
        }
      }
    }
    if (!hangRequested && wdtRegistered) esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void ledTask(void *arg) {
  (void)arg;
  bool on = false;
  uint32_t last = millis();
  for (;;) {
    uint32_t now = millis();
    if (now - last >= LED_TOGGLE_MS) {
      last = now;
      on = !on;
      uint32_t color = 0;
      if (on) {
        if (flameActive) color = led.Color(220, 0, 0);
        else if (!rfidGood || !dhtGood) color = led.Color(190, 0, 130); // magenta
        else color = led.Color(0, 180, 0);                         // green
      }
      led.setPixelColor(0, color);
      led.show();
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void serialTask(void *arg) {
  (void)arg;
  String buffer;
  uint32_t lastStatus = millis() - STATUS_INTERVAL_MS;
  for (;;) {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\r') continue;
      if (c == '\n') { command(buffer); buffer = ""; }
      else if (buffer.length() < 50) buffer += c;
    }
    uint32_t now = millis();
    if (now - lastStatus >= STATUS_INTERVAL_MS) {
      lastStatus = now;
      statusLine();
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void setup() {
  // Setup flame first, before network, RGB or task scheduling.
  pinMode(PIN_FLAME, INPUT_PULLUP);
  bool bootFlamePin = digitalRead(PIN_FLAME);
  flameActive = FLAME_ACTIVE_LOW ? !bootFlamePin : bootFlamePin;
  doorUnlocked = flameActive;

  Serial.begin(115200);
  const uint32_t deadline = millis() + 3000;
  while (!Serial && (int32_t)(deadline - millis()) > 0) delay(10);
  serialMutex = xSemaphoreCreateMutex();
  Serial.println();
  printLocked("[EVENT] BOOT reason=" + String(getResetReason()));
  printLocked("[TEST] Team=07 board=ESP32-S3-CAM firmware=" + String(FW_VERSION));
  printLocked("[TEST] Startup flame=" + String(flameActive ? 1 : 0) +
              " door=" + String(doorUnlocked ? "UNLOCKED" : "LOCKED"));
  printLocked("[TEST] RFID CS=2 SCK=47 MISO=21 MOSI=39 RST=42; DHT=1 FLAME=38 RGB=48");

  led.begin(); led.setBrightness(55); led.clear(); led.show();
#if ESP_IDF_VERSION_MAJOR >= 5
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = WDT_TIMEOUT_MS;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  esp_err_t init = esp_task_wdt_init(&cfg);
  if (init == ESP_ERR_INVALID_STATE) init = esp_task_wdt_reconfigure(&cfg);
#else
  esp_err_t init = esp_task_wdt_init(6, true);
#endif
  printLocked("[TEST] watchdog_init=" + String(esp_err_to_name(init)));
  if (init != ESP_OK) printLocked("[ERROR] WATCHDOG CONFIG FAILED - DO NOT CLAIM LEVEL 1 PASS");

  BaseType_t t1 = xTaskCreatePinnedToCore(sensorTask, "sensors", 6144, nullptr, 2, &sensorTaskHandle, 0);
  BaseType_t t2 = xTaskCreatePinnedToCore(ledTask, "led", 4096, nullptr, 2, &ledTaskHandle, 1);
  BaseType_t t3 = xTaskCreatePinnedToCore(serialTask, "serial", 6144, nullptr, 1, &serialTaskHandle, 1);
  printLocked("[TEST] task_creation=" + String(t1==pdPASS && t2==pdPASS && t3==pdPASS ? "OK" : "FAILED"));
  printLocked("[CMD] type help, health, tasks, ver, status or hang");
}

void loop() {
  // Work is in independent pinned FreeRTOS tasks.
  vTaskDelay(pdMS_TO_TICKS(1000));
}

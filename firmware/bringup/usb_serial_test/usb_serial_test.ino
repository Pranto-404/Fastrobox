// FastRobox hardware bring-up: USB serial only.
// This is a connectivity diagnostic, NOT a completed Level 1 firmware.
// ESP32-S3 + Arduino-ESP32; set USB CDC On Boot = Enabled.
// No external sensor wiring is needed for this test.
#include <Arduino.h>

static unsigned long lastPrint = 0;
static String command;

void setup() {
  Serial.begin(115200);
  const unsigned long deadline = millis() + 3000;
  while (!Serial && (long)(deadline - millis()) > 0) delay(10);

  Serial.println();
  Serial.println("[TEST] FASTROBOX USB SERIAL OK");
  Serial.printf("[TEST] chip=%s cores=%d\n", ESP.getChipModel(), ESP.getChipCores());
  Serial.printf("[TEST] flash=%lu bytes psram=%lu bytes\n",
                (unsigned long)ESP.getFlashChipSize(),
                (unsigned long)ESP.getPsramSize());
  Serial.println("[TEST] Type ping or health, then press Enter.");
}

void loop() {
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.printf("[TEST] uptime=%lu s free_heap=%lu bytes\n",
                  (unsigned long)(millis() / 1000),
                  (unsigned long)ESP.getFreeHeap());
  }

  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      command.trim();
      if (command.equalsIgnoreCase("ping")) {
        Serial.println("[TEST] PONG");
      } else if (command.equalsIgnoreCase("health")) {
        Serial.printf("[TEST] health chip=%s cores=%d heap=%lu psram=%lu uptime=%lu\n",
                      ESP.getChipModel(), ESP.getChipCores(),
                      (unsigned long)ESP.getFreeHeap(),
                      (unsigned long)ESP.getFreePsram(),
                      (unsigned long)(millis() / 1000));
      } else if (command.length()) {
        Serial.printf("[TEST] Unknown command: %s\n", command.c_str());
      }
      command = "";
    } else if (command.length() < 64) {
      command += c;
    }
  }
}

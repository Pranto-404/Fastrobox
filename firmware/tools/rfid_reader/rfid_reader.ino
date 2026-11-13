// FastRobox: RFID UID reader + saver (Arduino IDE).
// Tap each card/tag once. Every new UID is saved in flash (survives power off).
// Serial Monitor: 115200 baud, line ending "New Line".
//
// Commands:
//   list                 show every saved UID (copy this and send it to the team)
//   label <n> <name>     give saved UID number n a name, e.g. "label 1 student_card", "label 2 teacher_tag"
//   clear                delete all saved UIDs
//   help                 show commands
//
// Wiring (same as docs/WIRING.md): SDA->41 SCK->47 MOSI->21 MISO->42 RST->40 3.3V->3V3 GND->GND, buzzer + ->38
// Libraries: "MFRC522" by GithubCommunity. Board package esp32 2.0.17, board "ESP32S3 Dev Module".

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Preferences.h>

#define PIN_RFID_SCK  47
#define PIN_RFID_MOSI 21
#define PIN_RFID_MISO 42
#define PIN_RFID_SS   41
#define PIN_RFID_RST  40
#define PIN_BUZZER    38
#define PIN_RGB_LED   48

static const int MAX_UIDS = 20;

MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
Preferences prefs;

String uids[MAX_UIDS];
String labels[MAX_UIDS];
int count = 0;

void beep(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

void flash(uint8_t r, uint8_t g, uint8_t b) {
  neopixelWrite(PIN_RGB_LED, r, g, b);
  delay(150);
  neopixelWrite(PIN_RGB_LED, 0, 0, 0);
}

// Saved in flash as "UID=label;UID=label;..."
void loadAll() {
  prefs.begin("rfid", true);
  String all = prefs.getString("list", "");
  prefs.end();
  count = 0;
  int start = 0;
  while (start < (int)all.length() && count < MAX_UIDS) {
    int end = all.indexOf(';', start);
    if (end < 0) end = all.length();
    String item = all.substring(start, end);
    int eq = item.indexOf('=');
    if (eq > 0) {
      uids[count] = item.substring(0, eq);
      labels[count] = item.substring(eq + 1);
      count++;
    }
    start = end + 1;
  }
}

void saveAll() {
  String all;
  for (int i = 0; i < count; i++) all += uids[i] + "=" + labels[i] + ";";
  prefs.begin("rfid", false);
  prefs.putString("list", all);
  prefs.end();
}

void printList() {
  Serial.printf("[CMD] saved UIDs: %d\n", count);
  for (int i = 0; i < count; i++) Serial.printf("[CMD] %d  uid=%s  name=%s\n", i + 1, uids[i].c_str(), labels[i].c_str());
  if (count == 0) Serial.println("[CMD] (none yet - tap a card)");
}

String readUid() {
  String s;
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) s += "0";
    s += String(rfid.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void handleCommand(String line) {
  line.trim();
  if (line.isEmpty()) return;
  if (line == "help") {
    Serial.println("[CMD] list | label <n> <name> | clear | help");
  } else if (line == "list") {
    printList();
  } else if (line == "clear") {
    count = 0;
    saveAll();
    Serial.println("[CMD] all UIDs deleted");
  } else if (line.startsWith("label ")) {
    int sp = line.indexOf(' ', 6);
    int n = line.substring(6, sp < 0 ? line.length() : sp).toInt();
    String name = sp < 0 ? "" : line.substring(sp + 1);
    name.trim();
    name.replace(";", "_");
    name.replace("=", "_");
    if (n < 1 || n > count || name.isEmpty()) {
      Serial.println("[CMD] usage: label <number from list> <name>");
      return;
    }
    labels[n - 1] = name;
    saveAll();
    Serial.printf("[CMD] %d is now '%s'\n", n, name.c_str());
  } else {
    Serial.printf("[CMD] unknown '%s' - type help\n", line.c_str());
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);

  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("\n[STATUS] RFID reader ready, RC522 version=0x%02X %s\n", v,
                (v == 0x00 || v == 0xFF) ? "-> NOT FOUND, check wiring" : "OK");
  loadAll();
  printList();
  Serial.println("[STATUS] tap a card or tag. Type 'help' for commands.");
}

void loop() {
  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      handleCommand(line);
      line = "";
    } else {
      line += c;
    }
  }

  static uint32_t last = 0;
  if (millis() - last < 200) return;  // poll the reader every 200 ms
  last = millis();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = readUid();
  String type = rfid.PICC_GetTypeName(rfid.PICC_GetType(rfid.uid.sak));
  rfid.PICC_HaltA();  // a card held on the reader is reported only once

  for (int i = 0; i < count; i++) {
    if (uids[i] == uid) {
      Serial.printf("[CARD] uid=%s type=%s -> already saved as #%d (%s)\n", uid.c_str(), type.c_str(), i + 1,
                    labels[i].c_str());
      flash(0, 0, 40);
      beep(60);
      return;
    }
  }
  if (count >= MAX_UIDS) {
    Serial.println("[CARD] list full - type 'clear'");
    return;
  }
  uids[count] = uid;
  labels[count] = "unnamed";
  count++;
  saveAll();
  Serial.printf("[CARD] uid=%s type=%s -> NEW, saved as #%d\n", uid.c_str(), type.c_str(), count);
  flash(0, 40, 0);
  beep(60);
  delay(80);
  beep(60);
}

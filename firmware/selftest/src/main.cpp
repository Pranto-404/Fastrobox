// FastRobox kit self-test.
// Checks every part of the kit one by one so wiring problems are found before real firmware runs.
// Open the Serial Monitor at 115200 baud and type a command (line ending: newline).
//
//   help   list commands            info   chip, flash, PSRAM, heap, temperature
//   led    RGB LED colour cycle     buzz   two short beeps
//   dht    read DHT11               flame  read flame sensor
//   rfid   RC522 version check      touch  panic-pad value vs baseline
//   cam    camera init + 1 photo    all    run every test once
//   watch  toggle live view (1 s readings + every card tap)

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <DHTesp.h>
#include "esp_camera.h"
#include "pins.h"

static MFRC522 rfid(PIN_RFID_SS, PIN_RFID_RST);
static DHTesp dht;
static uint32_t touchBaseline = 0;
static bool watching = false;
static bool cameraReady = false;

// ---------- helpers ----------
static void led(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(PIN_RGB_LED, r, g, b); }

static void beep(uint32_t ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

static const char *okFail(bool ok) { return ok ? "OK" : "FAIL"; }

// ---------- tests ----------
static void testInfo() {
  Serial.printf("[INFO] chip=%s rev=%d cores=%d cpu=%luMHz\n", ESP.getChipModel(), ESP.getChipRevision(),
                ESP.getChipCores(), (unsigned long)ESP.getCpuFreqMHz());
  Serial.printf("[INFO] flash=%luMB psram=%luKB (free %luKB) heap free=%luKB\n",
                (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)), (unsigned long)(ESP.getPsramSize() / 1024),
                (unsigned long)(ESP.getFreePsram() / 1024), (unsigned long)(ESP.getFreeHeap() / 1024));
  Serial.printf("[INFO] chip_temp=%.1fC  expected: flash=16MB psram=8192KB -> %s\n", temperatureRead(),
                okFail(ESP.getFlashChipSize() >= 16UL * 1024 * 1024 && ESP.getPsramSize() > 7UL * 1024 * 1024));
}

static void testLed() {
  Serial.println("[LED] red, green, blue, yellow, magenta, cyan, purple, off");
  const uint8_t c[][3] = {{40, 0, 0}, {0, 40, 0}, {0, 0, 40}, {40, 30, 0}, {40, 0, 40}, {0, 40, 40}, {20, 0, 40}, {0, 0, 0}};
  for (auto &x : c) {
    led(x[0], x[1], x[2]);
    delay(400);
  }
  Serial.println("[LED] did you see all 7 colours? (If not, the LED pin is not 48.)");
}

static void testBuzzer() {
  Serial.println("[BUZZ] two short beeps");
  beep(100);
  delay(150);
  beep(100);
}

static bool testDht(bool quiet = false) {
  TempAndHumidity v = dht.getTempAndHumidity();
  bool ok = dht.getStatus() == DHTesp::ERROR_NONE;
  if (!quiet || !ok)
    Serial.printf("[DHT] %s T=%.1fC RH=%.0f%% (%s)\n", okFail(ok), v.temperature, v.humidity, dht.getStatusString());
  return ok;
}

static void testFlame() {
  int raw = digitalRead(PIN_FLAME);
  Serial.printf("[FLAME] DO=%d -> %s  (DO-LED on the module lights when it sees flame; turn the blue pot to tune)\n",
                raw, raw == LOW ? "FLAME" : "no flame");
}

static bool testRfid(bool quiet = false) {
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  bool ok = !(v == 0x00 || v == 0xFF);
  if (!quiet || !ok)
    Serial.printf("[RFID] version=0x%02X %s %s\n", v, okFail(ok),
                  ok ? "(tap the card or key tag now)" : "(check SDA/SCK/MOSI/MISO and 3.3V)");
  return ok;
}

static void calibrateTouch() {
  uint64_t sum = 0;
  for (int i = 0; i < 50; i++) {
    sum += touchRead(PIN_TOUCH);
    delay(5);
  }
  touchBaseline = sum / 50;
  Serial.printf("[TOUCH] baseline=%lu (do not touch the wire during start-up)\n", (unsigned long)touchBaseline);
}

static void testTouch() {
  uint32_t v = touchRead(PIN_TOUCH);
  float ratio = touchBaseline ? (float)v / touchBaseline : 0;
  Serial.printf("[TOUCH] value=%lu baseline=%lu ratio=%.2f -> %s\n", (unsigned long)v, (unsigned long)touchBaseline,
                ratio, ratio > 1.3f ? "TOUCHED" : "not touched");
}

static bool initCamera() {
  if (cameraReady) return true;
  camera_config_t c = {};
  c.pin_pwdn = CAM_PIN_PWDN;     c.pin_reset = CAM_PIN_RESET;  c.pin_xclk = CAM_PIN_XCLK;
  c.pin_sccb_sda = CAM_PIN_SIOD; c.pin_sccb_scl = CAM_PIN_SIOC;
  c.pin_d7 = CAM_PIN_D7; c.pin_d6 = CAM_PIN_D6; c.pin_d5 = CAM_PIN_D5; c.pin_d4 = CAM_PIN_D4;
  c.pin_d3 = CAM_PIN_D3; c.pin_d2 = CAM_PIN_D2; c.pin_d1 = CAM_PIN_D1; c.pin_d0 = CAM_PIN_D0;
  c.pin_vsync = CAM_PIN_VSYNC;   c.pin_href = CAM_PIN_HREF;    c.pin_pclk = CAM_PIN_PCLK;
  c.xclk_freq_hz = 20000000;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;
  c.jpeg_quality = 12;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;
  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init FAIL err=0x%x (check the ribbon cable is fully in and latched)\n", err);
    return false;
  }
  sensor_t *s = esp_camera_sensor_get();
  Serial.printf("[CAM] sensor PID=0x%04X %s\n", s->id.PID, s->id.PID == OV3660_PID ? "(OV3660)" : "");
  if (s->id.PID == OV3660_PID) {  // OV3660 image comes out upside-down and washed out by default
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, -2);
  }
  cameraReady = true;
  return true;
}

static void testCamera() {
  if (!initCamera()) return;
  camera_fb_t *fb = esp_camera_fb_get();  // the first frame after init can be dark, so take two
  if (fb) esp_camera_fb_return(fb);
  fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM] capture FAIL");
    return;
  }
  Serial.printf("[CAM] capture OK %ux%u JPEG %u bytes\n", fb->width, fb->height, (unsigned)fb->len);
  esp_camera_fb_return(fb);
}

static void pollCard() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  Serial.print("[CARD] uid=");
  for (byte i = 0; i < rfid.uid.size; i++) Serial.printf("%02X", rfid.uid.uidByte[i]);
  Serial.printf(" type=%s\n", rfid.PICC_GetTypeName(rfid.PICC_GetType(rfid.uid.sak)));
  rfid.PICC_HaltA();  // a halted card is not reported again while it stays on the reader
  beep(60);
}

static void runAll() {
  testInfo();
  testLed();
  testBuzzer();
  testDht();
  testFlame();
  testRfid();
  testTouch();
  testCamera();
  Serial.println("[ALL] done. Now type 'watch', then tap the card, touch the wire, and bring a flame near.");
}

static void printHelp() {
  Serial.println("[CMD] help info led buzz dht flame rfid touch cam all watch");
}

static void handleCommand(String cmd) {
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.isEmpty()) return;
  if (cmd == "help") printHelp();
  else if (cmd == "info") testInfo();
  else if (cmd == "led") testLed();
  else if (cmd == "buzz") testBuzzer();
  else if (cmd == "dht") testDht();
  else if (cmd == "flame") testFlame();
  else if (cmd == "rfid") testRfid();
  else if (cmd == "touch") testTouch();
  else if (cmd == "cam") testCamera();
  else if (cmd == "all") runAll();
  else if (cmd == "watch") {
    watching = !watching;
    Serial.printf("[CMD] watch %s\n", watching ? "ON" : "OFF");
  } else Serial.printf("[CMD] unknown '%s' - type help\n", cmd.c_str());
}

// ---------- Arduino entry points ----------
void setup() {
  Serial.begin(115200);
  delay(1500);  // give the Serial Monitor time to attach
  Serial.println("\n[STATUS] FastRobox kit self-test - type 'help'");

  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  pinMode(PIN_FLAME, INPUT);
  led(0, 0, 10);

  dht.setup(PIN_DHT, DHTesp::DHT11);
  SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SS);
  rfid.PCD_Init();
  calibrateTouch();
  runAll();
}

void loop() {
  static String line;
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      handleCommand(line);
      line = "";
    } else {
      line += ch;
    }
  }

  static uint32_t lastCard = 0;
  if (millis() - lastCard >= 200) {  // RFID polled every 200 ms, like the real firmware
    lastCard = millis();
    pollCard();
  }

  static uint32_t lastWatch = 0;
  if (watching && millis() - lastWatch >= 1000) {
    lastWatch = millis();
    TempAndHumidity v = dht.getTempAndHumidity();
    bool dhtOk = dht.getStatus() == DHTesp::ERROR_NONE;
    uint32_t t = touchRead(PIN_TOUCH);
    Serial.printf("[STATUS] T=%s RH=%s flame=%d touch=%lu(%.2fx) rfid=%s chip=%.1fC heap=%luk\n",
                  dhtOk ? String(v.temperature, 1).c_str() : "ERR", dhtOk ? String(v.humidity, 0).c_str() : "ERR",
                  digitalRead(PIN_FLAME) == LOW, (unsigned long)t, touchBaseline ? (float)t / touchBaseline : 0.f,
                  testRfid(true) ? "OK" : "ERR", temperatureRead(), (unsigned long)(ESP.getFreeHeap() / 1024));
  }
}

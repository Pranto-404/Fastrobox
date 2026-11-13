#include "web.h"
#include "shared.h"
#include "settings.h"
#include "wifinet.h"
#include "webfiles.h"
#include <WiFi.h>
#include <WebServer.h>
#include <LittleFS.h>
#include "esp_task_wdt.h"

static WebServer server(80);

static void writeFile(const char *path, const char *content) {
  File f = LittleFS.open(path, "w");
  if (f) {
    f.print(content);
    f.close();
  }
}

// Copy the built-in pages into LittleFS once per page version.
static void installPages() {
  if (!LittleFS.begin(false)) {
    // First start on a new partition table: formatting ~8 MB takes up to a minute (only once).
    logf("[STATUS] preparing the flash file system (first start only, may take up to 60 s)...");
    if (!LittleFS.format() || !LittleFS.begin(false)) {
      logf("[ERROR] LittleFS mount failed: check that partitions.csv is in the sketch folder");
      return;
    }
    logf("[STATUS] flash file system ready");
  }
  File v = LittleFS.open("/version.txt", "r");
  String have = v ? v.readString() : "";
  if (v) v.close();
  if (have != WEB_VERSION) {
    writeFile("/index.html", INDEX_HTML);
    writeFile("/setup.html", SETUP_HTML);
    writeFile("/version.txt", WEB_VERSION);
    logf("[STATUS] local web pages installed in LittleFS (v%s)", WEB_VERSION);
  }
}

static void sendFile(const char *path) {
  File f = LittleFS.open(path, "r");
  if (!f) {
    server.send(500, "text/plain", "page missing");
    return;
  }
  server.sendHeader("Cache-Control", "no-store");
  server.streamFile(f, "text/html");
  f.close();
}

static bool fromSetupNetwork() {
  return WiFi.getMode() & WIFI_MODE_AP && server.client().localIP() == WiFi.softAPIP();
}

static String esc(const char *s) {
  String o;
  for (; *s; s++) {
    if (*s == '"' || *s == '\\') o += '\\';
    o += *s;
  }
  return o;
}

static void handleStatus() {
  DeviceState s = stateSnapshot();
  char timeBuf[24] = "";
  if (time(nullptr) > 1700000000) {
    time_t n = time(nullptr);
    struct tm t;
    localtime_r(&n, &t);
    strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", &t);
  }
  const char *conn = s.setupMode ? "SETUP" : (s.serverLive ? "LIVE" : "OFFLINE");
  char hi[12] = "null";
  if (s.hiValid) snprintf(hi, sizeof(hi), "%.1f", s.heatIndex);
  const char *notice = (s.notice[0] && (int32_t)(s.noticeUntil - millis()) > 0) ? s.notice : "";
  char json[900];
  snprintf(json, sizeof(json),
           "{\"device_id\":\"%s\",\"room_id\":\"%s\",\"local_time\":\"%s\",\"temp_c\":%s,\"rh\":%s,\"status\":\"%s\","
           "\"heat_index_c\":%s,\"trend\":\"%s\",\"fire\":%s,\"silenced\":%s,\"panic\":%s,\"notice\":\"%s\","
           "\"flame\":%s,\"door\":\"%s\",\"last_uid\":\"%s\",\"rssi\":%d,\"wifi\":%s,\"chip_temp_c\":%.1f,\"fw\":\"%s\","
           "\"connection\":\"%s\",\"ip\":\"%s\",\"mdns\":\"%s.local\",\"uptime_s\":%lu,\"pending\":%u,"
           "\"dht_error\":%s,\"rfid_error\":%s,\"quality\":\"%s\"}",
           deviceId(), esc(s.roomId).c_str(), timeBuf,
           (s.dhtHasReading && !s.dhtError) ? String(s.tempC, 1).c_str() : "null",
           (s.dhtHasReading && !s.dhtError) ? String(s.rh, 0).c_str() : "null", overallStatus(s), hi, trendName(s),
           s.fire ? "true" : "false", s.silenced ? "true" : "false", s.panic ? "true" : "false", notice,
           s.flame ? "true" : "false",
           s.doorUnlocked ? "UNLOCKED" : "LOCKED", s.lastUid, s.wifiConnected ? s.rssi : 0,
           s.wifiConnected ? "true" : "false", s.chipTempC, FW_VERSION, conn, s.ip, mdnsName(),
           (unsigned long)uptimeSeconds(), s.pending, s.dhtError ? "true" : "false", s.rfidError ? "true" : "false",
           s.qualityGood ? "good" : "bad");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", json);
}

static String clean(String v, size_t maxLen) {
  v.trim();
  if (v.length() > maxLen) v = v.substring(0, maxLen);
  return v;
}

static void handleSave() {
  NetConfig c = loadNetConfig();
  c.ssid = clean(server.arg("ssid"), 32);
  c.pass = server.arg("pass").substring(0, 64);
  String room = clean(server.arg("room"), 24);
  String token = clean(server.arg("token"), 64);
  String okRoom;
  for (char ch : room)
    if (isalnum(ch) || ch == '-' || ch == '_') okRoom += ch;  // Room ID goes into JSON: keep it simple
  if (c.ssid.isEmpty() || okRoom.isEmpty()) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Network and Room ID are required\"}");
    return;
  }
  c.room = okRoom;
  String label = String(deviceId()) + "=";
  if (token.startsWith(label)) token = token.substring(label.length());  // pasted with its "T07-D1=" label
  if (token.length()) c.token = token;  // empty = keep the saved token
  if (c.token.isEmpty()) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Device token is required\"}");
    return;
  }
  wifiSubmitSetup(c);
  server.send(200, "application/json", "{\"ok\":true}");
}

static void webTask(void *) {
  installPages();          // may format the file system once: done before joining the watchdog
  // Opening a socket before the Wi-Fi task has started the TCP/IP stack crashes the board
  // ("tcpip_send_msg_wait_sem ... Invalid mbox"), so wait for it.
  while (!wifiStackReady()) vTaskDelay(pdMS_TO_TICKS(20));
  esp_task_wdt_add(NULL);
  server.on("/", HTTP_GET, [] { sendFile(fromSetupNetwork() && stateSnapshot().setupMode ? "/setup.html" : "/index.html"); });
  server.on("/setup", HTTP_GET, [] { sendFile("/setup.html"); });
  server.on("/status", HTTP_GET, [] { sendFile("/index.html"); });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/scan", HTTP_GET, [] { server.send(200, "application/json", wifiScanJson()); });
  server.on("/api/setup", HTTP_GET, [] { server.send(200, "application/json", wifiSetupStateJson()); });
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound([] {  // phones probing for a captive portal land on the right page
    server.sendHeader("Location", "/", true);
    server.send(302, "text/plain", "");
  });
  server.begin();
  for (;;) {
    server.handleClient();
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(5));
  }
}

void startWebTask() {
  TaskHandle_t h;
  xTaskCreatePinnedToCore(webTask, "web", 8192, nullptr, 1, &h, 0);
  registerTask(h, "web", 0, 5);
}

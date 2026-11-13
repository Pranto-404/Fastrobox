#include "uplink.h"
#include "shared.h"
#include "outbox.h"
#include "settings.h"
#include "certs.h"
#include "safety.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

static WiFiClientSecure tls;
static String token;
static uint32_t lastOk = 0;
static bool everConnected = false, live = false;

static void setLive(bool now) {
  if (now == live) return;
  live = now;
  withState([&](DeviceState &s) { s.serverLive = now; });
  if (now) logf("[NET] server %s: https://%s", everConnected ? "reconnected" : "connected", SERVER_HOST);
  else logf("[NET] server disconnected (no reply for %d s), records are kept and sent later", LIVE_TIMEOUT_MS / 1000);
  if (now) everConnected = true;
}

// Returns the HTTP status, or a negative number for a network/TLS error.
static int post(const char *path, const char *body) {
  HTTPClient http;
  http.setReuse(true);           // keep the TLS connection open between records
  http.setConnectTimeout(5000);
  http.setTimeout(6000);
  if (!http.begin(tls, SERVER_HOST, SERVER_PORT, path, true)) return -100;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + token);
  int code = http.POST((uint8_t *)body, strlen(body));
  http.end();
  return code;
}

// Commands come back as plain text lines "type|arg". Reset fire / register a Teacher tag.
static void runCommand(const String &line) {
  int bar = line.indexOf('|');
  String type = bar < 0 ? line : line.substring(0, bar);
  String arg = bar < 0 ? "" : line.substring(bar + 1);
  logf("[CMD] from platform: %s %s", type.c_str(), arg.c_str());
  if (type == "reset_fire") safetyResetFire(arg.length() ? arg.c_str() : "platform");
  else if (type == "register_teacher") safetyArmTeacherRegistration();
}

static void pollCommands() {
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(5000);
  http.setTimeout(6000);
  String path = String("/api/v1/commands?device_id=") + deviceId();
  if (!http.begin(tls, SERVER_HOST, SERVER_PORT, path, true)) return;
  http.addHeader("Authorization", String("Bearer ") + token);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    lastOk = millis();
    setLive(true);
    int start = 0;
    while (start < (int)body.length()) {
      int nl = body.indexOf('\n', start);
      if (nl < 0) nl = body.length();
      String line = body.substring(start, nl);
      line.trim();
      if (line.length()) runCommand(line);
      start = nl + 1;
    }
  }
  http.end();
}

static void uplinkTask(void *) {
  tls.setCACert(CA_BUNDLE);
  tls.setHandshakeTimeout(8);
  char json[512];
  uint32_t backoff = 1000, lastTokenWarn = 0, lastErrLog = 0;
  for (;;) {
    DeviceState s = stateSnapshot();
    if (live && millis() - lastOk > LIVE_TIMEOUT_MS) setLive(false);
    if (!s.wifiConnected) {
      setLive(false);
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    static uint32_t lastPoll = 0;
    if (millis() - lastPoll >= COMMAND_POLL_MS) {  // also the heartbeat that keeps the device "online"
      lastPoll = millis();
      token = loadNetConfig().token;
      pollCommands();
    }
    Record r;
    if (!outboxPeek(r)) {
      ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(200));  // woken as soon as something is queued
      continue;
    }
    if (!recordToJson(r, json, sizeof(json))) {  // clock not set yet: wait for internet time
      vTaskDelay(pdMS_TO_TICKS(300));
      continue;
    }
    token = loadNetConfig().token;
    int code = post(r.isEvent ? "/api/v1/events" : "/api/v1/telemetry", json);
    if (code == 201 || code == 409) {  // stored, or already stored earlier (never stored twice)
      outboxPop();
      lastOk = millis();
      setLive(true);
      backoff = 1000;
    } else if (code == 401) {
      if (millis() - lastTokenWarn > 10000) {
        lastTokenWarn = millis();
        logf("[ERROR] server refused the device token: check the token on the setup page");
      }
      vTaskDelay(pdMS_TO_TICKS(3000));
    } else {
      if (millis() - lastErrLog > 5000) {
        lastErrLog = millis();
        logf("[NET] server not reachable (%s), retrying in %lus", code < 0 ? HTTPClient::errorToString(code).c_str() : String(code).c_str(),
             (unsigned long)(backoff / 1000));
      }
      tls.stop();  // start a fresh TLS session next time
      vTaskDelay(pdMS_TO_TICKS(backoff));
      backoff = min<uint32_t>(backoff * 2, 4000);
    }
  }
}

void startUplinkTask() {
  TaskHandle_t h;
  // 12 KB stack: TLS. Not on the task watchdog: a TLS connect may legitimately wait up to ~14 s.
  xTaskCreatePinnedToCore(uplinkTask, "uplink", 12288, nullptr, 1, &h, 0);
  registerTask(h, "uplink", 0, 0);
  outboxSetNotify(h);
}

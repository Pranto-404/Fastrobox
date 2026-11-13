#include "wifinet.h"
#include "shared.h"
#include "outbox.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include "esp_task_wdt.h"

enum Mode { SETUP, TRYING, CONNECTED, RECONNECTING };

static Mode mode = SETUP;
static NetConfig cfg;
static SemaphoreHandle_t mtx = xSemaphoreCreateMutex();
static bool submitPending = false;
static NetConfig submitted;
static String setupError = "";
static String scanCache = "[]";
static volatile bool evGotIp = false, evDisconnected = false;
static volatile uint8_t evReason = 0;
static bool apOn = false;
static uint32_t tryStart = 0, nextTry = 0, gap = 1000, apOffAt = 0, lastScan = 0;
static int attempts = 0;
static bool timeAnnounced = false;

static const char *reasonText(uint8_t r) {
  switch (r) {
    case WIFI_REASON_NO_AP_FOUND: return "network not found";
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_AUTH_EXPIRE: return "wrong password";
    case WIFI_REASON_CONNECTION_FAIL: return "connection failed";
    default: return "disconnected";
  }
}

static bool fatalReason(uint8_t r) {
  return r == WIFI_REASON_NO_AP_FOUND || r == WIFI_REASON_AUTH_FAIL || r == WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT ||
         r == WIFI_REASON_HANDSHAKE_TIMEOUT || r == WIFI_REASON_AUTH_EXPIRE || r == WIFI_REASON_CONNECTION_FAIL;
}

static void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) evGotIp = true;
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    evReason = info.wifi_sta_disconnected.reason;
    evDisconnected = true;
  }
}

static void setNetState(bool setup, bool connected) {
  String ip = connected ? WiFi.localIP().toString() : String("");
  withState([&](DeviceState &s) {
    s.setupMode = setup;
    s.wifiConnected = connected;
    strlcpy(s.ip, ip.c_str(), sizeof(s.ip));
    if (!connected) s.serverLive = false;
  });
}

static void startAP() {
  if (apOn) return;
  WiFi.mode(WIFI_AP_STA);
  char ssid[32];
  snprintf(ssid, sizeof(ssid), "SmartClass-%s", TEAM_ID);
  WiFi.softAP(ssid, apPassword());
  apOn = true;
  logf("[NET] setup mode: access point %s password=%s, open http://%s", ssid, apPassword(),
       WiFi.softAPIP().toString().c_str());
  WiFi.scanNetworks(true);  // async scan for the setup page
  lastScan = millis();
}

static void stopAP() {
  if (!apOn) return;
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  apOn = false;
  logf("[NET] setup access point off");
}

static void startMdnsAndTime() {
  MDNS.end();
  if (MDNS.begin(mdnsName())) {
    MDNS.addService("http", "tcp", 80);
  }
  configTzTime(TZ_DHAKA, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
}

static void beginConnect(const NetConfig &c) {
  evGotIp = evDisconnected = false;
  WiFi.disconnect(false, false);
  WiFi.begin(c.ssid.c_str(), c.pass.c_str());
  attempts++;
  logf("[NET] connecting to \"%s\" (attempt %d)", c.ssid.c_str(), attempts);
}

static void onConnected(bool wasReconnect) {
  evGotIp = false;
  evDisconnected = false;
  String ip = WiFi.localIP().toString();
  setNetState(false, true);
  logf("[NET] %s IP=%s mDNS=http://%s.local RSSI=%d", wasReconnect ? "Wi-Fi reconnected" : "Wi-Fi connected",
       ip.c_str(), mdnsName(), WiFi.RSSI());
  startMdnsAndTime();
  attempts = 0;
  gap = 1000;
  mode = CONNECTED;
}

void wifiSubmitSetup(const NetConfig &c) {
  xSemaphoreTake(mtx, portMAX_DELAY);
  submitted = c;
  submitPending = true;
  setupError = "";
  xSemaphoreGive(mtx);
}

void wifiFactoryReset() {
  logf("[NET] clearing saved Wi-Fi details and restarting in setup mode");
  clearWifiDetails();
  Serial.flush();
  delay(200);
  ESP.restart();
}

String wifiScanJson() {
  xSemaphoreTake(mtx, portMAX_DELAY);
  String s = scanCache;
  xSemaphoreGive(mtx);
  return s;
}

String wifiSetupStateJson() {
  xSemaphoreTake(mtx, portMAX_DELAY);
  const char *st = submitPending || mode == TRYING ? "trying" : (mode == CONNECTED ? "connected" : (setupError.length() ? "error" : "setup"));
  String j = String("{\"state\":\"") + st + "\",\"error\":\"" + setupError + "\",\"ip\":\"" +
             (mode == CONNECTED ? WiFi.localIP().toString() : String("")) + "\",\"mdns\":\"" + mdnsName() +
             ".local\",\"ssid\":\"" + cfg.ssid + "\",\"room\":\"" + cfg.room + "\",\"has_token\":" +
             (cfg.token.length() ? "true" : "false") + ",\"device_id\":\"" + deviceId() + "\"}";
  xSemaphoreGive(mtx);
  return j;
}

static void refreshScan() {
  int n = WiFi.scanComplete();
  if (n >= 0) {
    String j = "[";
    for (int i = 0; i < n; i++) {
      String ssid = WiFi.SSID(i);
      if (!ssid.length() || ssid.indexOf('"') >= 0 || ssid.indexOf('\\') >= 0) continue;
      bool dup = false;  // keep the strongest entry for each name
      for (int k = 0; k < i; k++)
        if (WiFi.SSID(k) == ssid && WiFi.RSSI(k) >= WiFi.RSSI(i)) dup = true;
      if (dup) continue;
      if (j.length() > 1) j += ",";
      j += "{\"ssid\":\"" + ssid + "\",\"rssi\":" + String(WiFi.RSSI(i)) + ",\"secure\":" +
           (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true") + "}";
    }
    j += "]";
    WiFi.scanDelete();
    xSemaphoreTake(mtx, portMAX_DELAY);
    scanCache = j;
    xSemaphoreGive(mtx);
  }
  if (apOn && mode == SETUP && n != WIFI_SCAN_RUNNING && millis() - lastScan > 15000) {
    WiFi.scanNetworks(true);
    lastScan = millis();
  }
}

static void wifiTask(void *) {
  esp_task_wdt_add(NULL);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.onEvent(onWifiEvent);
  WiFi.setHostname(mdnsName());
  cfg = loadNetConfig();
  withState([&](DeviceState &s) { strlcpy(s.roomId, cfg.room.c_str(), sizeof(s.roomId)); });
  logf("[NET] device %s, setup access point SmartClass-%s password=%s", deviceId(), TEAM_ID, apPassword());

  if (cfg.ssid.isEmpty()) {
    mode = SETUP;
    setNetState(true, false);
    startAP();
  } else {
    WiFi.mode(WIFI_STA);
    beginConnect(cfg);
    tryStart = millis();
    mode = cfg.verified ? RECONNECTING : TRYING;
    nextTry = millis() + 10000;
  }

  uint32_t bootPressedAt = 0, lastRssi = 0;
  for (;;) {
    uint32_t now = millis();

    // ---- BOOT button held 5 s -> forget Wi-Fi ----
    if (digitalRead(PIN_BOOT_BTN) == LOW) {
      if (!bootPressedAt) bootPressedAt = now;
      if (now - bootPressedAt >= BOOT_HOLD_MS) {
        logf("[NET] BOOT button held 5 s");
        wifiFactoryReset();
      }
    } else {
      bootPressedAt = 0;
    }

    // ---- new details from the setup page ----
    xSemaphoreTake(mtx, portMAX_DELAY);
    bool doSubmit = submitPending;
    NetConfig sub = submitted;
    submitPending = false;
    xSemaphoreGive(mtx);
    if (doSubmit) {
      sub.verified = false;
      cfg = sub;
      saveNetConfig(cfg);
      withState([&](DeviceState &s) { strlcpy(s.roomId, cfg.room.c_str(), sizeof(s.roomId)); });
      logf("[NET] setup saved: network \"%s\", room \"%s\"", cfg.ssid.c_str(), cfg.room.c_str());
      attempts = 0;
      beginConnect(cfg);
      tryStart = now;
      mode = TRYING;
    }

    switch (mode) {
      case SETUP:
        refreshScan();
        break;

      case TRYING:  // new, unverified details: success -> save, failure -> setup page with the error
        if (evGotIp) {
          cfg.verified = true;
          saveNetConfig(cfg);
          onConnected(false);
          if (apOn) apOffAt = now + 8000;  // leave the setup page up briefly so it can show the new address
        } else if ((evDisconnected && fatalReason(evReason)) || now - tryStart > SETUP_TRY_MS) {
          const char *why = evDisconnected ? reasonText(evReason) : "no answer from the network";
          xSemaphoreTake(mtx, portMAX_DELAY);
          setupError = String("Could not join \"") + cfg.ssid + "\": " + why;
          xSemaphoreGive(mtx);
          logf("[NET] setup error: %s", setupError.c_str());
          WiFi.disconnect(false, false);
          mode = SETUP;
          setNetState(true, false);
          startAP();
        }
        break;

      case CONNECTED:
        if (apOffAt && now > apOffAt) {
          stopAP();
          apOffAt = 0;
        }
        if (evDisconnected || WiFi.status() != WL_CONNECTED) {
          logf("[NET] Wi-Fi disconnected (%s), uptime keeps counting: up=%lus", reasonText(evReason),
               (unsigned long)uptimeSeconds());
          setNetState(false, false);
          mode = RECONNECTING;
          gap = 1000;
          nextTry = now + gap;
          evDisconnected = false;
        } else if (now - lastRssi > 1000) {
          lastRssi = now;
          int r = WiFi.RSSI();
          withState([&](DeviceState &s) { s.rssi = r; });
        }
        break;

      case RECONNECTING:  // details that worked before: keep trying, never fall back to setup
        if (evGotIp) {
          onConnected(true);
        } else if (now >= nextTry) {
          beginConnect(cfg);
          nextTry = now + 6000 + gap;  // give the attempt ~6 s, then wait the gap
          logf("[NET] next reconnect attempt in %lus if this one fails", (unsigned long)((6000 + gap) / 1000));
          gap = min<uint32_t>(gap * 2, RECONNECT_MAX_GAP_MS);
        } else if (evDisconnected) {
          evDisconnected = false;
          if (nextTry > now + gap) nextTry = now + gap;  // failed early: retry after the gap
        }
        break;
    }

    if (!timeAnnounced && clockValid()) {
      timeAnnounced = true;
      struct tm t;
      time_t n = time(nullptr);
      localtime_r(&n, &t);
      char buf[32];
      strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &t);
      logf("[NET] internet time set: %s (Asia/Dhaka)", buf);
    }

    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

void startWifiTask() {
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  setenv("TZ", TZ_DHAKA, 1);
  tzset();
  TaskHandle_t h;
  xTaskCreatePinnedToCore(wifiTask, "wifi", 6144, nullptr, 2, &h, 0);
  registerTask(h, "wifi", 0, 50);
}

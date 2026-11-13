#pragma once
// Wi-Fi: setup access point + setup page, connect / reconnect with growing gaps, mDNS, internet time,
// and the BOOT-button (5 s) reset. Runs as its own task on core 0.
#include <Arduino.h>
#include "settings.h"

void startWifiTask();
bool wifiStackReady();                    // true once WiFi.mode() has started the network stack
void wifiFactoryReset();                 // clear Wi-Fi details and restart in setup mode
void wifiSubmitSetup(const NetConfig &c); // called by the setup page
String wifiScanJson();                   // networks seen by the last scan
String wifiSetupStateJson();             // what the setup page shows while connecting

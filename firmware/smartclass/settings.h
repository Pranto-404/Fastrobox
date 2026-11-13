#pragma once
// Settings kept in flash (NVS): Wi-Fi details, Room ID, device token, access-point password, seq lease.
#include <Arduino.h>

struct NetConfig {
  String ssid;
  String pass;
  String room;
  String token;
  bool verified = false;  // true once these Wi-Fi details have connected at least once
};

void settingsBegin();
NetConfig loadNetConfig();
void saveNetConfig(const NetConfig &c);
void clearWifiDetails();        // `reset` / BOOT 5 s: forget ssid + password, keep Room ID and token
const char *apPassword();       // 8 characters, generated once and kept in flash
uint32_t nextSeq();             // increases forever, never reused, even after a restart

// Level 3: kept in flash so a power cut cannot lock people in or lose the Teacher tags.
bool loadFireLatched();
bool loadSilenced();
void saveFireState(bool latched, bool silenced);
String loadTeacherTags();       // "UID1,UID2,"
bool isTeacherTag(const char *uid);
void addTeacherTag(const char *uid);

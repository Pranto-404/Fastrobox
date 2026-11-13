#include "settings.h"
#include <Preferences.h>
#include "esp_random.h"

static Preferences prefs;
static SemaphoreHandle_t seqMutex = xSemaphoreCreateMutex();
static SemaphoreHandle_t nvsMutex = xSemaphoreCreateRecursiveMutex();  // several tasks write settings
struct NvsLock {
  NvsLock() { xSemaphoreTakeRecursive(nvsMutex, portMAX_DELAY); }
  ~NvsLock() { xSemaphoreGiveRecursive(nvsMutex); }
};
static uint32_t seqNext = 0, seqLeaseEnd = 0;
static char apPass[9] = "";
static const uint32_t SEQ_LEASE = 100;

void settingsBegin() {
  prefs.begin("net", false);
  String p = prefs.getString("appass", "");
  if (p.length() != 8) {
    const char *chars = "abcdefghjkmnpqrstuvwxyz23456789";  // no look-alike characters (l/1, o/0)
    p = "";
    for (int i = 0; i < 8; i++) p += chars[esp_random() % strlen(chars)];
    prefs.putString("appass", p);
  }
  strlcpy(apPass, p.c_str(), sizeof(apPass));

  // seq: start where the last lease ended and reserve the next block before using it,
  // so a restart can only skip numbers, never repeat them.
  seqNext = prefs.getUInt("seq_end", 1);
  seqLeaseEnd = seqNext + SEQ_LEASE;
  prefs.putUInt("seq_end", seqLeaseEnd);
}

NetConfig loadNetConfig() {
  NvsLock lock;
  NetConfig c;
  c.ssid = prefs.getString("ssid", "");
  c.pass = prefs.getString("pass", "");
  c.room = prefs.getString("room", "");
  c.token = prefs.getString("token", "");
  c.verified = prefs.getBool("verified", false);
  return c;
}

void saveNetConfig(const NetConfig &c) {
  NvsLock lock;
  prefs.putString("ssid", c.ssid);
  prefs.putString("pass", c.pass);
  prefs.putString("room", c.room);
  prefs.putString("token", c.token);
  prefs.putBool("verified", c.verified);
}

void clearWifiDetails() {
  NvsLock lock;
  prefs.remove("ssid");
  prefs.remove("pass");
  prefs.putBool("verified", false);
}

const char *apPassword() { return apPass; }

uint32_t nextSeq() {
  xSemaphoreTake(seqMutex, portMAX_DELAY);
  NvsLock lock;
  uint32_t s = seqNext++;
  if (seqNext >= seqLeaseEnd) {
    seqLeaseEnd = seqNext + SEQ_LEASE;
    prefs.putUInt("seq_end", seqLeaseEnd);
  }
  xSemaphoreGive(seqMutex);
  return s;
}

bool loadFireLatched() {
  NvsLock lock;
  return prefs.getBool("fire", false);
}
bool loadSilenced() {
  NvsLock lock;
  return prefs.getBool("silenced", false);
}

void saveFireState(bool latched, bool silenced) {
  NvsLock lock;
  prefs.putBool("fire", latched);
  prefs.putBool("silenced", silenced);
}

String loadTeacherTags() {
  NvsLock lock;
  return prefs.getString("teachers", "");
}

bool isTeacherTag(const char *uid) {
  String key = String(uid) + ",";
  return loadTeacherTags().indexOf(key) >= 0;
}

void addTeacherTag(const char *uid) {
  NvsLock lock;
  if (isTeacherTag(uid)) return;
  prefs.putString("teachers", loadTeacherTags() + uid + ",");
}

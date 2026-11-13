#include "console.h"
#include "shared.h"
#include "wifinet.h"
#include "safety.h"

void printStatusLine() {
  DeviceState s = stateSnapshot();
  char t[12] = "-", rh[12] = "-";
  if (s.dhtHasReading && !s.dhtError) {
    snprintf(t, sizeof(t), "%.1fC", s.tempC);
    snprintf(rh, sizeof(rh), "%.0f%%", s.rh);
  }
  char rssi[8] = "-", hi[12] = "-";
  if (s.wifiConnected) snprintf(rssi, sizeof(rssi), "%d", s.rssi);
  if (s.hiValid) snprintf(hi, sizeof(hi), "%.1fC", s.heatIndex);
  logf("[STATUS] up=%lus T=%s RH=%s HI=%s flame=%d door=%s state=%s trend=%s rssi=%s heap=%luk psram=%luk "
       "chip=%.1fC fw=%s",
       (unsigned long)uptimeSeconds(), t, rh, hi, s.flame ? 1 : 0, s.doorUnlocked ? "UNLOCKED" : "LOCKED",
       overallStatus(s), trendName(s), rssi,
       (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)(ESP.getFreePsram() / 1024), s.chipTempC,
       FW_VERSION);
}

static void printHealth() {
  DeviceState s = stateSnapshot();
  char rssi[12] = "-";
  if (s.wifiConnected) snprintf(rssi, sizeof(rssi), "%ddBm", s.rssi);
  logf("[CMD] health chip_temp=%.1fC heap_free=%luk psram_free=%luk flash=%luMB cpu=%luMHz rssi=%s uptime=%lus "
       "reset=%s fw=%s",
       s.chipTempC, (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)(ESP.getFreePsram() / 1024),
       (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)), (unsigned long)ESP.getCpuFreqMHz(),
       rssi, (unsigned long)uptimeSeconds(), resetReasonName(), FW_VERSION);
}

static void handleCommand(String cmd) {
  cmd.trim();
  cmd.toLowerCase();
  if (cmd.isEmpty()) return;

  if (cmd == "help") {
    logf("[CMD] commands:");
    logf("[CMD]   help    list all commands");
    logf("[CMD]   status  print one status line now");
    logf("[CMD]   health  chip temp, heap, PSRAM, flash, CPU, Wi-Fi RSSI, uptime, reset reason, firmware");
    logf("[CMD]   tasks   every task with its CPU core and free stack");
    logf("[CMD]   ver     firmware version and build date");
    logf("[CMD]   hang    freeze the main task (watchdog test)");
    logf("[CMD]   reset   clear saved Wi-Fi and restart in setup mode (Level 2)");
    logf("[CMD]   csi     Wi-Fi CSI packets/s, subcarriers, channel (Level 11)");
    logf("[CMD]   teacher the next tapped tag is saved as a Teacher tag");
    logf("[CMD]   touch   panic-pad reading now vs the start-up baseline");
  } else if (cmd == "status") {
    printStatusLine();
  } else if (cmd == "health") {
    printHealth();
  } else if (cmd == "tasks") {
    printTasks();
  } else if (cmd == "ver") {
    logf("[CMD] ver fw=%s built=%s %s", FW_VERSION, __DATE__, __TIME__);
  } else if (cmd == "hang") {
    logf("[CMD] hang: main task frozen, the watchdog will restart the board in ~%d s", WDT_TIMEOUT_S);
    Serial.flush();
    for (;;) {
      // Deliberately never returns and never feeds the watchdog.
    }
  } else if (cmd == "reset") {
    logf("[CMD] reset: clearing saved Wi-Fi details");
    wifiFactoryReset();
  } else if (cmd == "touch") {
    DeviceState s = stateSnapshot();
    uint32_t v = touchRead(PIN_TOUCH);
    logf("[CMD] touch value=%lu baseline=%lu ratio=%.2f (panic above %.2f)", (unsigned long)v,
         (unsigned long)s.touchBaseline, s.touchBaseline ? (float)v / s.touchBaseline : 0.f, TOUCH_RATIO);
  } else if (cmd == "teacher") {
    safetyArmTeacherRegistration();
  } else if (cmd == "csi") {
    logf("[CMD] csi: Wi-Fi CSI arrives in Level 11");
  } else {
    logf("[CMD] unknown command '%s' - type help", cmd.c_str());
  }
}

void pollConsole() {
  static String line;
  while (Serial.available()) {  // never waits: only reads what has already arrived
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      handleCommand(line);
      line = "";
    } else if (line.length() < 64) {
      line += c;
    }
  }
}

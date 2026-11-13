#include "console.h"
#include "shared.h"

void printStatusLine() {
  DeviceState s = stateSnapshot();
  char t[12] = "-", rh[12] = "-";
  if (s.dhtHasReading && !s.dhtError) {
    snprintf(t, sizeof(t), "%.1fC", s.tempC);
    snprintf(rh, sizeof(rh), "%.0f%%", s.rh);
  }
  // Fields of levels not built yet print "-": HI and trend (Level 3), rssi (Level 2).
  logf("[STATUS] up=%lus T=%s RH=%s HI=- flame=%d door=%s state=SAFE trend=- rssi=- heap=%luk psram=%luk "
       "chip=%.1fC fw=%s",
       (unsigned long)uptimeSeconds(), t, rh, s.flame ? 1 : 0, s.doorUnlocked ? "UNLOCKED" : "LOCKED",
       (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)(ESP.getFreePsram() / 1024), s.chipTempC,
       FW_VERSION);
}

static void printHealth() {
  DeviceState s = stateSnapshot();
  logf("[CMD] health chip_temp=%.1fC heap_free=%luk psram_free=%luk flash=%luMB cpu=%luMHz rssi=- uptime=%lus "
       "reset=%s fw=%s",
       s.chipTempC, (unsigned long)(ESP.getFreeHeap() / 1024), (unsigned long)(ESP.getFreePsram() / 1024),
       (unsigned long)(ESP.getFlashChipSize() / (1024 * 1024)), (unsigned long)ESP.getCpuFreqMHz(),
       (unsigned long)uptimeSeconds(), resetReasonName(), FW_VERSION);
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
    logf("[CMD] reset: Wi-Fi setup arrives in Level 2");
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

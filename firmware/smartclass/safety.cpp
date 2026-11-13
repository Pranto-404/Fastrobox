#include "safety.h"
#include "shared.h"
#include "settings.h"
#include "outbox.h"
#include "esp_task_wdt.h"

static volatile bool registerNextTag = false;

// A candle flickers, so the sensor output drops for a moment now and then.
static bool flameRecently(const DeviceState &s, uint32_t windowMs) {
  return s.lastFlameMs && millis() - s.lastFlameMs < windowMs;
}

// ---------- heat index (NOAA / Rothfusz, with the simple formula below 80 F) ----------
static float heatIndexC(float tC, float rh) {
  float t = tC * 9.0f / 5.0f + 32.0f;
  float hi = 0.5f * (t + 61.0f + (t - 68.0f) * 1.2f + rh * 0.094f);
  if ((hi + t) / 2.0f >= 80.0f) {
    hi = -42.379f + 2.04901523f * t + 10.14333127f * rh - 0.22475541f * t * rh - 0.00683783f * t * t -
         0.05481717f * rh * rh + 0.00122874f * t * t * rh + 0.00085282f * t * rh * rh - 0.00000199f * t * t * rh * rh;
    if (rh < 13.0f && t >= 80.0f && t <= 112.0f) hi -= ((13.0f - rh) / 4.0f) * sqrtf((17.0f - fabsf(t - 95.0f)) / 17.0f);
    else if (rh > 85.0f && t >= 80.0f && t <= 87.0f) hi += ((rh - 85.0f) / 10.0f) * ((87.0f - t) / 5.0f);
  }
  return (hi - 32.0f) * 5.0f / 9.0f;
}

static void setNotice(const char *msg) {
  withState([&](DeviceState &s) {
    strlcpy(s.notice, msg, sizeof(s.notice));
    s.noticeUntil = millis() + 10000;
  });
}

// ---------- fire ----------
static void latchFire() {
  saveFireState(true, false);  // saved BEFORE anything else: a power cut now still restarts UNLOCKED
  withState([](DeviceState &s) {
    s.fire = true;
    s.silenced = false;
    s.doorUnlocked = true;
  });
  logf("[STATUS] FIRE - EVACUATE: door UNLOCKED");
  emitEvent("FIRE", "flame held 2 s, door UNLOCKED");
}

void safetyResetFire(const char *by) {
  DeviceState s = stateSnapshot();
  if (!s.fire) {
    logf("[CMD] Reset fire: no fire latched");
    return;
  }
  if (flameRecently(s, FLAME_RECENT_MS)) {
    logf("[CMD] Reset fire refused: flame still present");
    setNotice("RESET REFUSED - FLAME PRESENT");
    return;
  }
  saveFireState(false, false);
  withState([](DeviceState &st) {
    st.fire = false;
    st.silenced = false;
    st.doorUnlocked = false;
  });
  char detail[48];
  snprintf(detail, sizeof(detail), "reset by %s, door LOCKED", by);
  emitEvent("FIRE_CLEARED", detail);
}

void safetyArmTeacherRegistration() {
  registerNextTag = true;
  logf("[CMD] tap the Teacher tag now: it will be saved as a Teacher tag");
}

void safetyOnCardTap(const char *uid) {
  if (registerNextTag) {
    registerNextTag = false;
    addTeacherTag(uid);
    logf("[CARD] uid=%s saved as Teacher tag", uid);
    return;
  }
  DeviceState s = stateSnapshot();
  bool sounding = s.fire || s.panic || (s.heatStatus == 2 && !s.dangerSilenced);
  if (!sounding) return;  // nothing to silence: a tap is just a card tap
  bool teacher = isTeacherTag(uid);
  if (!teacher) {
    logf("[CARD] uid=%s is not a Teacher tag: only a Teacher tag can silence the alarm", uid);
    return;
  }
  if (!s.fire) {  // panic or Danger beep: the Teacher tag stops the sound at once
    char detail[48];
    snprintf(detail, sizeof(detail), "%s alarm, teacher tag %s", s.panic ? "panic" : "danger", uid);
    withState([](DeviceState &st) {
      if (st.panic) st.panic = false;
      else st.dangerSilenced = true;
    });
    emitEvent("SILENCED", detail);
    return;
  }
  if (flameRecently(s, FLAME_RECENT_MS)) {
    logf("[CARD] Teacher tag refused: CANNOT SILENCE - FLAME PRESENT");
    setNotice("CANNOT SILENCE - FLAME PRESENT");
    return;
  }
  if (s.silenced) return;
  saveFireState(true, true);
  withState([](DeviceState &st) { st.silenced = true; });
  char detail[40];
  snprintf(detail, sizeof(detail), "teacher tag %s, door stays UNLOCKED", uid);
  emitEvent("SILENCED", detail);
}

void safetyBegin() {
  bool latched = loadFireLatched();
  bool silenced = loadSilenced();
  withState([&](DeviceState &s) {
    s.fire = latched;
    s.silenced = latched && silenced;
    if (latched) s.doorUnlocked = true;
  });
  if (latched) logf("[STATUS] fire latch restored from flash: door stays UNLOCKED until Reset fire");
}

// ---------- status machine, heat index, trend, fire detection: every 100 ms on core 1 ----------
static void safetyTask(void *) {
  esp_task_wdt_add(NULL);
  float history[TREND_READINGS];
  int histCount = 0;
  uint32_t seenReads = 0;
  uint8_t candidate = 0;
  uint32_t candidateSince = 0;
  uint32_t flameSince = 0;
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    DeviceState s = stateSnapshot();
    uint32_t now = millis();

    // Data quality: a failed or impossible reading is never used and the last status is kept.
    bool good = s.dhtHasReading && !s.dhtError && s.tempC >= 0 && s.tempC <= 50 && s.rh >= 20 && s.rh <= 90;

    if (good && s.dhtReads != seenReads) {  // a new reading: heat index + trend
      seenReads = s.dhtReads;
      if (histCount == TREND_READINGS) {
        memmove(history, history + 1, sizeof(float) * (TREND_READINGS - 1));
        histCount--;
      }
      history[histCount++] = s.tempC;
      int8_t trend = 0;
      if (histCount >= 4) {  // least-squares slope in C per reading
        float n = histCount, sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (int i = 0; i < histCount; i++) {
          sx += i;
          sy += history[i];
          sxy += i * history[i];
          sxx += i * i;
        }
        float slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        trend = slope >= TREND_SLOPE_C ? 1 : slope <= -TREND_SLOPE_C ? -1 : 0;
      }
      float hi = heatIndexC(s.tempC, s.rh);
      bool valid = histCount >= 4;
      withState([&](DeviceState &st) {
        st.heatIndex = hi;
        st.hiValid = true;
        st.trend = trend;
        st.trendValid = valid;
      });
    }

    // Overall status with hysteresis. Danger: in at 40, out at 38. Warning: in at 32 or RH 85,
    // out only at <= 30 C and <= 80 % RH. A new status must hold 3 s. The trend never changes it.
    if (good) {
      uint8_t cur = s.heatStatus;
      bool danger = cur == 2 ? s.tempC > DANGER_TEMP_C - HYSTERESIS_C : s.tempC >= DANGER_TEMP_C;
      bool warning = cur >= 1 ? !(s.tempC <= WARN_TEMP_C - HYSTERESIS_C && s.rh <= WARN_RH_EXIT)
                              : (s.tempC >= WARN_TEMP_C || s.rh >= WARN_RH);
      uint8_t want = danger ? 2 : warning ? 1 : 0;
      if (want == cur) {
        candidate = cur;
      } else if (want != candidate) {
        candidate = want;
        candidateSince = now;
      } else if (now - candidateSince >= STATUS_HOLD_MS) {
        withState([&](DeviceState &st) {
          st.heatStatus = want;
          if (want != 2) st.dangerSilenced = false;  // a new Danger beeps again
        });
        char detail[24];
        snprintf(detail, sizeof(detail), "%s->%s", heatStatusName(cur), heatStatusName(want));
        emitEvent("STATUS", detail);
      }
    }
    if (good != s.qualityGood) withState([&](DeviceState &st) { st.qualityGood = good; });

    // Fire: flame seen continuously for 2 s -> FIRE at once (no 3 s hold). Gaps < 300 ms are flicker.
    if (flameRecently(s, FLAME_GAP_MS)) {
      if (!flameSince) flameSince = now;
      if (!s.fire && now - flameSince >= FIRE_HOLD_MS) latchFire();
    } else {
      flameSince = 0;
    }

    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(100));
  }
}

// ---------- touch panic pad: every 50 ms on core 1 ----------
static void touchTask(void *) {
  esp_task_wdt_add(NULL);
  uint32_t thr = (uint32_t)(stateSnapshot().touchBaseline * TOUCH_RATIO);
  uint32_t touchSince = 0, lastTouched = 0, panicStart = 0;
  bool fired = false;
  TickType_t last = xTaskGetTickCount();
  for (;;) {
    uint32_t now = millis();
    if (touchRead(PIN_TOUCH) > thr) lastTouched = now;  // on the ESP32-S3 the reading rises when touched
    bool touched = lastTouched && now - lastTouched < TOUCH_GAP_MS;
    if (touched) {
      if (!touchSince) touchSince = now;
      if (!fired && now - touchSince >= PANIC_HOLD_MS) {
        fired = true;  // once per touch; a touch shorter than 2 s (and so < 1 s) does nothing
        panicStart = now;
        withState([](DeviceState &s) { s.panic = true; });
        logf("[STATUS] PANIC - help requested from the touch pad");
        emitEvent("PANIC", "touch pad held 2 s");
      }
    } else {
      touchSince = 0;
      fired = false;
    }
    if (panicStart && now - panicStart >= PANIC_ALARM_MS) {
      panicStart = 0;
      withState([](DeviceState &s) { s.panic = false; });
    }
    esp_task_wdt_reset();
    vTaskDelayUntil(&last, pdMS_TO_TICKS(50));
  }
}

void startSafetyTasks() {
  String tags = loadTeacherTags();
  int count = 0;
  for (char c : tags)
    if (c == ',') count++;
  logf("[STATUS] Teacher tags saved: %d%s", count, count ? "" : " (type 'teacher' and tap the key tag to add one)");
  // Calibrate the touch baseline at start-up (nobody touching the pad).
  uint64_t sum = 0;
  for (int i = 0; i < 50; i++) {
    sum += touchRead(PIN_TOUCH);
    delay(4);
  }
  uint32_t base = sum / 50;
  withState([&](DeviceState &s) { s.touchBaseline = base; });
  logf("[STATUS] touch-pad baseline=%lu threshold=%lu (calibrated at start-up)", (unsigned long)base,
       (unsigned long)(base * TOUCH_RATIO));

  TaskHandle_t h;
  xTaskCreatePinnedToCore(safetyTask, "safety", 4096, nullptr, 3, &h, 1);
  registerTask(h, "safety", 1, 100);
  xTaskCreatePinnedToCore(touchTask, "touch", 3072, nullptr, 3, &h, 1);
  registerTask(h, "touch", 1, 50);
}

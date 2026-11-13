#pragma once
#include "shared.h"
// Level 3: overall status (Safe / Warning / Danger) with hysteresis and a 3 s hold, heat index, trend,
// data quality, fire latch + fail-safe door, Teacher-tag silence, touch panic pad.

void safetyBegin();                 // restore the fire latch from flash (call before the door is set)
void startSafetyTasks();
void safetyOnCardTap(const char *uid);  // called by the RFID task for every tap
void safetyResetFire(const char *by);   // Reset fire (Teacher / Admin from the platform)
void safetyArmTeacherRegistration();    // the next tapped tag becomes a Teacher tag
const char *alarmName(const DeviceState &s);  // fire / panic / danger / none

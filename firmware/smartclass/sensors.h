#pragma once
// Sensor tasks: DHT11 (5 s), flame (100 ms), RFID (200 ms), system snapshot (1 s).
void startSensorTasks();
bool readFlameAtStartup();

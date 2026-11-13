#pragma once
// Pin map for the FastRobox kit board: "ESP32-S3 WROOM" (module ESP32-S3-N16R8, OV3660 camera).
// Layout matches the Freenove ESP32-S3-WROOM CAM board. See docs/WIRING.md.
//
// Camera uses GPIO 4-13 and 15-18. Octal PSRAM uses GPIO 35-37. GPIO 19/20 = native USB.
// GPIO 0 = BOOT button, GPIO 48 = onboard RGB LED (WS2812), GPIO 2 = onboard blue LED.
// Strapping pins 0, 3, 45, 46 are left unused.

// ---- RC522 RFID (SPI, 3.3 V only) ----
#define PIN_RFID_SCK   47
#define PIN_RFID_MOSI  21
#define PIN_RFID_MISO  42
#define PIN_RFID_SS    41   // module pin "SDA"
#define PIN_RFID_RST   40

// ---- Sensors / outputs ----
#define PIN_DHT        1    // DHT11 module "DATA"
#define PIN_FLAME      39   // flame module "DO" (LOW = flame on most modules)
#define PIN_BUZZER     38   // active buzzer "+" (other leg to GND)
#define PIN_TOUCH      14   // bare jumper wire = panic pad (touch channel T14)

// ---- Onboard ----
#define PIN_RGB_LED    48
#define PIN_BOOT_BTN   0

// ---- Camera (same map as Espressif "ESP32S3_EYE" / Freenove S3 CAM) ----
#define CAM_PIN_PWDN   -1
#define CAM_PIN_RESET  -1
#define CAM_PIN_XCLK   15
#define CAM_PIN_SIOD   4
#define CAM_PIN_SIOC   5
#define CAM_PIN_D7     16   // Y9
#define CAM_PIN_D6     17   // Y8
#define CAM_PIN_D5     18   // Y7
#define CAM_PIN_D4     12   // Y6
#define CAM_PIN_D3     10   // Y5
#define CAM_PIN_D2     8    // Y4
#define CAM_PIN_D1     9    // Y3
#define CAM_PIN_D0     11   // Y2
#define CAM_PIN_VSYNC  6
#define CAM_PIN_HREF   7
#define CAM_PIN_PCLK   13

# Fastrobox

Official version-controlled workspace for the Fastrobox hackathon project.

## Repository status

- **Project:** Fastrobox — AI-Powered Smart Classroom (FastRobox 1.0 Grand Finale, Team T07)
- **Default branch:** `main`
- **Firmware:** USB bring-up and Level 1 sketches committed; **not yet verified on the physical board.**
- **Web platform (`web/`):** backend, device API, roles, live dashboards, Bangla, admin, attendance
  and security logic implemented and tested without hardware (43 automated tests + 17 browser checks).
  **Not deployed yet; no level has been judged.** Status per level: [`docs/LEVEL_MAPPING.md`](docs/LEVEL_MAPPING.md).

## Layout

| Path | Contents |
|---|---|
| `firmware/` | ESP32-S3-CAM Arduino sketches |
| `web/` | Next.js platform: dashboards + REST API for the device |
| `supabase/migrations/` | Postgres schema (Supabase) |
| `docs/` | [API contract for the firmware](docs/API_CONTRACT.md), [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), [testing](docs/TESTING.md), [level mapping](docs/LEVEL_MAPPING.md), [evidence templates](docs/evidence/) |

## Run the platform locally

Requirements: Node.js 20+ and PostgreSQL 16 (local, Docker or Supabase).

```bash
cd web
npm ci
cp .env.example .env.local        # set DATABASE_URL; APP_MODE=demo for the simulator
npm run db:migrate
APP_MODE=demo npm run seed -- --demo   # demo accounts + simulated device (passwords printed once)
npm run dev                            # http://localhost:3000
SIM_DEVICE_TOKEN=<token printed by seed> npm run simulate -- --url http://localhost:3000 --scenario heat
npm test                               # needs TEST_DATABASE_URL (database is recreated)
```

Production deployment (Vercel + Supabase): see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Immediate hardware test

1. Install Arduino IDE 2 and `esp32 by Espressif Systems` boards package.
2. Connect the ESP32-S3-CAM by a data-capable USB cable.
3. Select `ESP32S3 Dev Module` for the initial test and enable `USB CDC On Boot` (if provided).
4. Open `firmware/bringup/usb_serial_test/usb_serial_test.ino` and upload.
5. Open Serial Monitor at **115200 baud** with **Newline** and verify the output: `[TEST] FASTROBOX USB SERIAL OK`.
6. Type `ping` and press Enter: expect `[TEST] PONG`. Type `health` and verify heap, PSRAM and core count.

This sketch is a **USB communication diagnostic, not a completed Level 1 implementation**. Do not wire sensors or assume GPIO pin numbers until the exact board revision and pinout are confirmed.

## Version-control workflow

- Keep `main` stable, with small descriptive commits and traceable history.
- Use feature branches for risky changes; tag tested, judged firmware only after real tests.
- Never commit passwords, Wi-Fi credentials, device tokens, cloud secrets, or face photos.
- Keep README and documentation aligned with observed hardware and test results.

## Local clone

```bash
git clone https://github.com/Pranto-404/Fastrobox.git
cd Fastrobox
```

## Notes

One ESP32-S3-CAM board and only organizer-provided electronic components may be used. Consult the participant question paper and judge's physical checklist for the requirements and evidence for each of the 12 sequential levels.

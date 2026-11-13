# Fastrobox: AI-Powered Smart Classroom

Our entry for the **FastRobox 1.0 Techathon Grand Finale** (BUBT). The challenge is *"AI-Powered Smart Classroom: Safety, Access and Vision"*: 12 levels in a fixed order, 500 marks, 7 hours on site, built on one **ESP32-S3-CAM** connected to a secure, live-hosted web platform.

## Start here

| Document | What it is |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Master plan: strategy, architecture, device↔server contract, pin map, how to build each level, prep schedule, event-day runbook, judging-call strategy, risks |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | Every requirement from the question paper as a tickable checklist. Use it for every rehearsal. |
| [`docs/WIRING.md`](docs/WIRING.md) | Kit wiring (pin by pin) and how to run the hardware self-test (`firmware/selftest`) |
| [`docs/JUDGING_SCRIPT.md`](docs/JUDGING_SCRIPT.md) | The judges' exact test rounds (A: L1–3, B: L4–8, C: L9–12) with our prep for each row. Rehearse with this. |
| [`docs/writeups/TEMPLATE.md`](docs/writeups/TEMPLATE.md) | Write-up template (5 required headings) for each level |

## Repository layout (target)

```
firmware/   PlatformIO project for the ESP32-S3-CAM (Arduino-ESP32 core)
server/     FastAPI backend + ML (face, person/pose, hand-raise, CSI training)
web/        React dashboard (EN/BN)
deploy/     docker-compose, Caddy (HTTPS), .env.example (no real secrets)
tools/      test helpers: replay, OTA test files, judge-account seeding, data collectors
docs/       plan, checklist, API contract, wiring, write-ups
```

## Build and run

### 1. Platform (cloud): `server/`
FastAPI + PostgreSQL. Live at **https://fastrobox-t07.onrender.com** (Render, region Singapore). The records page is at `/records` and needs the admin login.

| Environment variable | What it is (set in the Render dashboard, **never** in the repo) |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Render: the database's *Internal Database URL*) |
| `DEVICE_TOKENS` | `T07-D1=<token>`: the token typed on the device setup page |
| `ADMIN_PASSWORD` | Password for `/records` (user `admin`, or `ADMIN_USER`) |

Run it locally:
```bash
cd server && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
export DATABASE_URL=postgresql://user:pass@localhost/fastrobox DEVICE_TOKENS=T07-D1=dev-token ADMIN_PASSWORD=dev
uvicorn app.main:app --reload
```
Deploy: push to the deployed branch (Render auto-deploys), or use the `render.yaml` blueprint.

### 2. Firmware (ESP32-S3): `firmware/smartclass/`
- **Arduino IDE 2:** open `firmware/smartclass/smartclass.ino`.
  - Board package **esp32 2.0.17**, board **ESP32S3 Dev Module**, Flash Size **16MB**, PSRAM **OPI PSRAM**, USB CDC On Boot **Disabled** (use the USB-UART port).
  - Libraries: **MFRC522** (GithubCommunity) and **DHT sensor library for ESPx** (beegee_tokyo).
  - `partitions.csv` in the sketch folder is used automatically (two 4 MB OTA app slots + LittleFS).
- **PlatformIO:** `cd firmware && pio run -e uart -t upload && pio device monitor`
- Team ID and server address are in `firmware/smartclass/config.h` (not secrets).

First start (no saved Wi-Fi):
1. The board opens the access point `SmartClass-T07` and prints its 8-character password on the Serial Monitor (115200).
2. Join it and open http://192.168.4.1. Pick the network, then enter its password, the Room ID and the device token.
3. The local status page is then at the device IP and at http://smartclass-t07.local.
4. Holding BOOT for 5 s, or typing `reset`, clears the saved Wi-Fi details.

### 3. Tools
- `tools/replay.py`: resends an old message to show that replays are rejected. Set `FASTROBOX_URL`, `ADMIN_PASSWORD` and `DEVICE_TOKEN` first.
- `tools/writeup/build.py LNN`: builds a level write-up PDF.

## Rules we follow in this repo

1. `main` is always demonstrable. Work happens on `feature/*` / `fix/*` branches and is merged via PR.
2. Small, descriptive commits (`feat:`, `fix:`, `docs:`…). Never rewrite history, because judges inspect it.
3. Each level is tagged `level-NN` on the exact commit used in its live test.
4. **No passwords, keys or tokens** in code or in the repo. Device tokens are typed on the setup page; server secrets live in `.env` on the server only. `gitleaks` runs before every commit and in CI.
5. Every team member must be able to explain every part of the code.

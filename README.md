# Fastrobox: AI-Powered Smart Classroom

Our entry for the **FastRobox 1.0 Techathon Grand Finale** (BUBT). The challenge is *"AI-Powered Smart Classroom: Safety, Access and Vision"*: 12 levels in a fixed order, 500 marks, 7 hours on site, built on one **ESP32-S3-CAM** connected to a secure, live-hosted web platform.

## Start here

| Document | What it is |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Master plan: strategy, architecture, device↔server contract, pin map, how to build each level, prep schedule, event-day runbook, judging-call strategy, risks |
| [`docs/CHECKLIST.md`](docs/CHECKLIST.md) | Every requirement from the question paper as a tickable checklist. Use it for every rehearsal. |
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

> This section is required from Level 2 on and must stay current. It will be filled in with exact commands as each part lands.

- **Firmware:** `cd firmware && pio run -t upload && pio run -t uploadfs`
- **Platform:** `cd deploy && cp .env.example .env` (fill in values locally; never commit them), then `docker compose up -d`

## Rules we follow in this repo

1. `main` is always demonstrable. Work happens on `feature/*` / `fix/*` branches and is merged via PR.
2. Small, descriptive commits (`feat:`, `fix:`, `docs:`…). Never rewrite history, because judges inspect it.
3. Each level is tagged `level-NN` on the exact commit used in its live test.
4. **No passwords, keys or tokens** in code or in the repo. Device tokens are typed on the setup page; server secrets live in `.env` on the server only. `gitleaks` runs before every commit and in CI.
5. Every team member must be able to explain every part of the code.

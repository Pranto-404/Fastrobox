# Architecture

```
ESP32-S3-CAM ──HTTPS (cert checked, bearer device token)──▶  Next.js server (Vercel)
  telemetry every 5 s, events at once, /poll every 2 s           │  route handlers = REST API
  /checkin (card UID + face crop)  /sync (offline buffer)        │  server components = dashboards
                                                                 ▼
Browsers (Admin/Teacher/Student/Guardian) ◀── HTTPS ──  Postgres (Supabase) — RLS on, no public access
  poll /api/live/* every 1.5 s                                   │
                                                                 ├─▶ Telegram Bot API (phone alerts)
                                                                 ├─▶ Open-Meteo (weather, planned)
                                                                 └─▶ Face / vision service (Python, planned: ml/)
```

## Components

| Part | Location | Notes |
|---|---|---|
| Web app + API | `web/` (Next.js 15, React 19, TypeScript, Tailwind 4) | Node runtime, server-only DB access |
| Database schema | `supabase/migrations/*.sql` | applied by `npm run db:migrate` or the Supabase CLI |
| Device API | `web/src/app/api/device/v1/*` | contract: `docs/API_CONTRACT.md` |
| Domain logic | `web/src/lib/*` | ingest, attendance, alerts, settings, access rules |
| Simulator | `web/scripts/simulate.ts` | DEMO mode only, data labelled SIMULATED DATA |
| Firmware | `firmware/` | Arduino sketches (hardware team) |

## Security model

* **Authentication.** Users: argon2id hashes, opaque random session tokens (only their SHA-256 is
  stored), `httpOnly` + `SameSite=Lax` + `Secure` cookie, lockout 5 failures → 30 s, every
  attempt logged. Devices: 256-bit bearer tokens, stored as SHA-256, revocable/rotatable.
* **Authorization** is enforced on the server for every request (`lib/auth/guard.ts`,
  `lib/access.ts`). Pages for another role return HTTP 403 before any data is queried.
* **Database.** RLS is enabled on every table and all privileges are revoked from Supabase's
  `anon`/`authenticated` roles, so the public Supabase API exposes nothing. Only the server
  (connection string in `DATABASE_URL`, server-side env) reads and writes.
* **CSRF.** State-changing browser endpoints reject cross-origin `Origin` headers; cookies are SameSite=Lax.
* **Device identity** comes only from the token; a `device_id` in the body must match it.
* **Privacy.** Face images used for check-in are never stored (only width/height/bytes are logged);
  the single exception is the private snapshot required for a FACE MISMATCH / SPOOF / INTRUDER /
  CAMERA FAULT alert, readable only by Teachers of that room and Admins, deleted with the student.
* **Secrets** live only in environment variables (`web/.env.example` lists them). Nothing secret is in the repository.

## Safety authority

The ESP32 decides fire/door/buzzer locally and keeps working without the server. The platform
records what the device reports and sends *requests* (settings, Reset fire, OTA). A request is
shown as pending until the device acknowledges it; the server never claims a device action happened.

## Periodic work without a worker

Offline detection and Absent marking run in `lib/sweeps.ts`, triggered (throttled to every 3 s)
by device polls and dashboard polls, so they keep running while anyone or any device is
connected. For unattended operation, call `/api/cron/tick` from an external scheduler (planned).

## DEMO vs LIVE mode

`APP_MODE=demo` allows devices registered as *simulated*; every record they produce carries
`is_simulated=true` and is shown with a **SIMULATED DATA** badge. `APP_MODE=live` rejects
simulated devices (HTTP 403) and hides their data. Switching needs only the environment variable.

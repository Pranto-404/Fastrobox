# Testing

## Automated (no hardware)

```bash
cd web
# a disposable Postgres 16, e.g.: docker run -p 54329:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/fastrobox_test npm test
npm run typecheck && npm run lint && npm run build
```

The test database is **dropped and recreated** at the start of every run.

| Suite | What it proves |
|---|---|
| `tests/safety.test.ts` | Level 3/5 rules: thresholds, humidity, 2 °C exit, 3 s hold, hair-dryer run gives exactly one DANGER→WARNING and one WARNING→SAFE at ≤ 30 °C, bad readings keep status, trend, settings validation ("45 °C" refused) |
| `tests/device-api.test.ts` | token auth, body device_id never trusted, strict schema, replay → 409 with unchanged count, room linking, clock fallback, events side effects, single FIRE alert, Reset fire only on device ack, offline sweep + recovery, offline sync with original times, settings ack rules |
| `tests/checkin.test.ts` | Level 7/8/9/12 decisions following the judges' Round B/C scripts (A Present, B Late + guardian notice, C NOT IN THIS CLASS, UNKNOWN CARD, NO CLASS NOW, D Absent at 31 min, mismatch ×3 → CARD BLOCKED even for A, unblock, spoof, camera rules, offline entry) |
| `tests/auth.test.ts` | argon2id, 5 wrong → 30 s lock (correct password refused), reset on success, concurrent attempts, login history, EN/BN dictionary parity |

Last recorded result (2026-11-13, local Postgres 16.4): **43/43 passed**.

## Browser smoke test

Against a running server with seeded accounts:

```bash
BASE_URL=http://localhost:3000 E2E_ADMIN=user:pass E2E_TEACHER=user:pass E2E_S1=user:pass \
E2E_S2=user:pass E2E_GUARDIAN=user:pass node e2e/smoke.mjs
```

Checks: live dashboard updates without reload, SIMULATED DATA label, Bangla on two pages and back,
Teacher refused the settings page and an admin API (403), S2 refused S1's attendance page and API
(403, no data), Student refused the dashboard, Guardian sees only the linked child (mobile size).
Last recorded result (2026-11-13, DEMO mode with the simulator): **17/17 passed**.

## Demo with the simulator

```bash
APP_MODE=demo npm run seed -- --demo        # prints demo passwords and the T07-SIM token once
APP_MODE=demo npm run build && APP_MODE=demo npm start
SIM_DEVICE_TOKEN=frx_dev_… npm run simulate -- --url http://localhost:3000 --scenario heat
```

Scenarios: `normal`, `heat`, `fire`, `panic`, `outage`, `replay`. All of this is SIMULATED DATA —
never judge evidence.

## Hardware tests

The live checks (judges' checklist rows A1–C8) can only be passed with the real board. Record each
measured value in the level's evidence file in `docs/evidence/`.

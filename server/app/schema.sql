-- FastRobox SmartClass database (PostgreSQL). Safe to run on every start-up.

CREATE TABLE IF NOT EXISTS devices (
  device_id        TEXT PRIMARY KEY,
  room_id          TEXT,
  online           BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen        TIMESTAMPTZ,
  last_boot_reason TEXT
);

-- Every (device_id, seq) is accepted exactly once, whether it is telemetry or an event.
-- A message sent twice (replay) hits this primary key and is rejected.
CREATE TABLE IF NOT EXISTS seen_seq (
  device_id   TEXT   NOT NULL,
  seq         BIGINT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, seq)
);

CREATE TABLE IF NOT EXISTS telemetry (
  id           BIGSERIAL PRIMARY KEY,
  device_id    TEXT   NOT NULL,
  room_id      TEXT,
  seq          BIGINT NOT NULL,
  ts           BIGINT NOT NULL,          -- Unix time (UTC) when the reading was taken
  uptime_s     BIGINT,
  temp_c       REAL,
  rh           REAL,
  heat_index_c REAL,
  flame        BOOLEAN,
  door         TEXT,
  status       TEXT,
  heat_trend   TEXT,
  rssi         INTEGER,
  heap_kb      INTEGER,
  chip_temp_c  REAL,
  fw           TEXT,
  quality      TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, seq)
);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT   NOT NULL,
  room_id     TEXT,
  seq         BIGINT,                    -- device events
  server_id   TEXT,                      -- server events use a server ID instead of seq
  ts          BIGINT NOT NULL,
  type        TEXT   NOT NULL,
  detail      TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, seq)
);

CREATE TABLE IF NOT EXISTS device_status_log (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  state     TEXT NOT NULL,               -- ONLINE / OFFLINE
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telemetry_device_ts ON telemetry (device_id, ts DESC);
CREATE INDEX IF NOT EXISTS events_device_ts    ON events (device_id, ts DESC);

-- Commands from the platform to a device (Reset fire, register a Teacher tag, ...).
CREATE TABLE IF NOT EXISTS commands (
  id           BIGSERIAL PRIMARY KEY,
  device_id    TEXT NOT NULL,
  type         TEXT NOT NULL,
  arg          TEXT NOT NULL DEFAULT '',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS commands_pending ON commands (device_id) WHERE delivered_at IS NULL;

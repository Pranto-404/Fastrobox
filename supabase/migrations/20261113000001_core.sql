-- FastRobox 1.0 — core schema: identity, classrooms, devices, telemetry, events,
-- alerts, settings, commands, OTA, audit.
--
-- Security model (see docs/ARCHITECTURE.md):
--   * Every table has Row Level Security ENABLED with NO policies for the
--     Supabase `anon` / `authenticated` roles, so the public Supabase REST and
--     Realtime APIs can read or write nothing.
--   * The Next.js server connects with a privileged database role
--     (DATABASE_URL, server-side only) and enforces role/classroom authorization
--     in code on every request (src/lib/auth/guard.ts, src/lib/access.ts).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- identity
create table users (
  id               uuid primary key default gen_random_uuid(),
  username         text not null unique check (username = lower(username) and username ~ '^[a-z0-9._-]{3,40}$'),
  display_name     text not null check (length(display_name) between 1 and 120),
  email            text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role             text not null check (role in ('admin', 'teacher', 'student', 'guardian')),
  password_hash    text not null,
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'bn')),
  telegram_chat_id text,
  failed_attempts  integer not null default 0 check (failed_attempts >= 0),
  locked_until     timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null unique,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index sessions_user_idx on sessions (user_id);

create table login_attempts (
  id         bigint generated always as identity primary key,
  username   text not null,
  user_id    uuid references users(id) on delete set null,
  success    boolean not null,
  reason     text not null check (reason in ('ok', 'bad_password', 'unknown_user', 'locked', 'inactive', 'invalid_input')),
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index login_attempts_user_idx on login_attempts (user_id, created_at desc);
create index login_attempts_time_idx on login_attempts (created_at desc);

-- ---------------------------------------------------------------- classrooms
create table classrooms (
  id         uuid primary key default gen_random_uuid(),
  room_code  text not null unique check (room_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  name       text not null,
  name_bn    text,
  building   text,
  capacity   integer not null default 40 check (capacity > 0 and capacity <= 1000),
  latitude   double precision check (latitude between -90 and 90),
  longitude  double precision check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

create table teacher_classrooms (
  teacher_id   uuid not null references users(id) on delete cascade,
  classroom_id uuid not null references classrooms(id) on delete cascade,
  primary key (teacher_id, classroom_id)
);
create index teacher_classrooms_room_idx on teacher_classrooms (classroom_id);

-- ---------------------------------------------------------------- devices
create table devices (
  id                  uuid primary key default gen_random_uuid(),
  device_uid          text not null unique check (device_uid ~ '^[A-Za-z0-9_-]{2,64}$'),  -- e.g. T07-D1
  name                text not null,
  classroom_id        uuid references classrooms(id) on delete set null,
  room_id             text,                 -- Room ID last reported by the device (entered on its setup page)
  is_simulated        boolean not null default false,
  online_threshold_s  integer not null default 15 check (online_threshold_s between 3 and 3600),
  firmware_version    text,
  last_seen_at        timestamptz,
  last_seq            bigint,
  last_reset_reason   text,
  last_card_uid       text,
  last_card_at        timestamptz,
  -- connection state machine maintained by the server (ingest + health sweep)
  connection_state    text not null default 'never_seen' check (connection_state in ('never_seen', 'online', 'offline')),
  offline_since       timestamptz,
  -- LIVE / OFFLINE / SYNCING as reported by the device's sync calls (Level 12)
  sync_pending        integer not null default 0 check (sync_pending >= 0),
  last_sync_at        timestamptz,
  -- most recent device-reported status (by recorded time, not arrival order)
  last_status         text check (last_status in ('SAFE', 'WARNING', 'DANGER', 'FIRE')),
  last_status_at      timestamptz,
  fire_latched        boolean not null default false,
  panic_at            timestamptz,
  -- camera (Level 9)
  camera_position     text not null default 'DOOR' check (camera_position in ('DOOR', 'ROOM')),
  camera_state        text not null default 'UNKNOWN' check (camera_state in ('UNKNOWN', 'OK', 'COVERED', 'MOVED')),
  night_mode          boolean not null default false,
  created_at          timestamptz not null default now()
);
create index devices_classroom_idx on devices (classroom_id);

-- Device tokens: only a SHA-256 hash of a 256-bit random secret is stored.
create table device_credentials (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references devices(id) on delete cascade,
  token_hash   text not null unique,
  token_prefix text not null,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index device_credentials_device_idx on device_credentials (device_id);

-- ---------------------------------------------------------------- telemetry
-- Field names follow the fixed data format of the question paper (section 6).
create table telemetry (
  id                bigint generated always as identity primary key,
  device_id         uuid not null references devices(id) on delete cascade,
  room_id           text not null,
  seq               bigint not null check (seq >= 0),
  ts                bigint,                      -- device Unix time (s, UTC) when the reading was taken
  clock_valid       boolean not null default false,
  received_at       timestamptz not null default now(),
  recorded_at       timestamptz not null,        -- = ts when the clock is valid, otherwise received_at
  uptime_s          bigint check (uptime_s >= 0),
  temp_c            numeric(5, 2),
  rh                numeric(5, 2),
  heat_index_c      numeric(5, 2),
  flame             boolean not null,
  door              text not null check (door in ('LOCKED', 'UNLOCKED')),
  status            text not null check (status in ('SAFE', 'WARNING', 'DANGER', 'FIRE')),
  heat_trend        text check (heat_trend in ('RISING', 'STABLE', 'FALLING')),
  rssi              integer check (rssi between -127 and 0),
  heap_kb           integer check (heap_kb >= 0),
  chip_temp_c       numeric(5, 2),
  fw                text,
  quality           text not null check (quality in ('good', 'bad')),
  is_offline_replay boolean not null default false,
  is_simulated      boolean not null default false,
  raw               jsonb not null,
  constraint telemetry_device_seq_unique unique (device_id, seq)
);
create index telemetry_device_time_idx on telemetry (device_id, recorded_at desc);

-- Device and server events (question paper section 6). Device events carry the
-- device's seq; server events have seq = NULL and are identified by their id.
create table device_events (
  id                bigint generated always as identity primary key,
  device_id         uuid references devices(id) on delete cascade,
  classroom_id      uuid references classrooms(id) on delete set null,
  room_id           text,
  seq               bigint check (seq >= 0),
  event_type        text not null check (event_type ~ '^[A-Z][A-Z0-9_]{1,40}$'),
  detail            text not null default '',
  severity          text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  origin            text not null default 'device' check (origin in ('device', 'server')),
  ts                bigint,
  clock_valid       boolean not null default false,
  recorded_at       timestamptz not null,
  received_at       timestamptz not null default now(),
  is_offline_replay boolean not null default false,
  is_simulated      boolean not null default false,
  constraint device_events_device_seq_unique unique (device_id, seq),
  check (origin = 'server' or (device_id is not null and seq is not null))
);
create index device_events_device_time_idx on device_events (device_id, recorded_at desc);
create index device_events_type_time_idx on device_events (event_type, recorded_at desc);
create index device_events_room_time_idx on device_events (classroom_id, recorded_at desc);

-- ---------------------------------------------------------------- alerts
create table alerts (
  id              bigint generated always as identity primary key,
  classroom_id    uuid references classrooms(id) on delete cascade,
  device_id       uuid references devices(id) on delete set null,
  alert_type      text not null check (alert_type in (
                    'FIRE', 'PANIC', 'HEAT_DANGER', 'HEAT_WARNING', 'SENSOR_ERROR', 'DEVICE_OFFLINE',
                    'FACE_MISMATCH', 'SPOOF', 'CARD_BLOCKED', 'INTRUDER', 'OVER_CAPACITY',
                    'CAMERA_FAULT', 'WEATHER', 'HAND_RAISED')),
  severity        text not null check (severity in ('info', 'warning', 'critical')),
  title           text not null,
  message         text not null,
  source_event_id bigint references device_events(id) on delete set null,
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid references users(id) on delete set null,
  acknowledged_at timestamptz,
  snapshot_id     uuid,
  resolved_at     timestamptz,
  is_simulated    boolean not null default false,
  created_at      timestamptz not null default now()
);
create index alerts_room_time_idx on alerts (classroom_id, created_at desc);
create index alerts_open_idx on alerts (status) where status = 'open';

create table alert_reads (
  alert_id bigint not null references alerts(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create table notification_deliveries (
  id         bigint generated always as identity primary key,
  alert_id   bigint references alerts(id) on delete cascade,
  channel    text not null check (channel in ('telegram', 'email', 'in_app')),
  recipient  text not null,
  status     text not null check (status in ('sent', 'failed', 'not_configured', 'skipped')),
  error      text,
  created_at timestamptz not null default now()
);
create index notification_deliveries_alert_idx on notification_deliveries (alert_id);

-- ---------------------------------------------------------------- settings / commands / OTA
create table device_settings (
  id         bigint generated always as identity primary key,
  device_id  uuid not null references devices(id) on delete cascade,
  version    integer not null check (version > 0),
  settings   jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint device_settings_version_unique unique (device_id, version)
);

create table device_commands (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references devices(id) on delete cascade,
  command_type text not null check (command_type in ('APPLY_SETTINGS', 'FIRE_RESET', 'OTA_UPDATE', 'CAMERA_POSITION', 'NIGHT_MODE')),
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'delivered', 'applied', 'failed', 'rejected', 'expired')),
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz,
  completed_at timestamptz,
  expires_at   timestamptz not null default now() + interval '10 minutes',
  result       jsonb
);
create index device_commands_pending_idx on device_commands (device_id, created_at) where status in ('pending', 'delivered');

create table firmware_releases (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique check (version ~ '^[0-9A-Za-z.+_-]{1,40}$'),
  filename     text not null,
  size_bytes   integer not null check (size_bytes > 0),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  binary_data  bytea not null,
  target_board text not null default 'ESP32-S3',
  notes        text,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table ota_jobs (
  id           uuid primary key default gen_random_uuid(),
  device_id    uuid not null references devices(id) on delete cascade,
  release_id   uuid not null references firmware_releases(id) on delete restrict,
  command_id   uuid references device_commands(id) on delete set null,
  from_version text,
  to_version   text not null,
  status       text not null default 'pending' check (status in (
                 'pending', 'downloading', 'verifying', 'installed', 'done', 'rejected', 'failed', 'rolled_back')),
  progress     integer not null default 0 check (progress between 0 and 100),
  message      text,
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index ota_jobs_device_idx on ota_jobs (device_id, created_at desc);

create table ota_job_events (
  id         bigint generated always as identity primary key,
  job_id     uuid not null references ota_jobs(id) on delete cascade,
  status     text not null,
  progress   integer,
  message    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- audit
create table audit_logs (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references users(id) on delete set null,
  action        text not null,
  target_type   text,
  target_id     text,
  details       jsonb not null default '{}'::jsonb,
  ip            text,
  created_at    timestamptz not null default now()
);
create index audit_logs_time_idx on audit_logs (created_at desc);

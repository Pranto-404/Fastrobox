-- FastRobox 1.0 — camera, occupancy, hand-raise and Wi-Fi CSI support tables.
-- Data in these tables must come from the real camera/CSI pipeline or be marked simulated.

-- Two saved positions per device, each with a reference snapshot (Level 9).
-- Reference snapshots show the empty view; they are not pictures of students.
create table camera_positions (
  id              uuid primary key default gen_random_uuid(),
  device_id       uuid not null references devices(id) on delete cascade,
  position        text not null check (position in ('DOOR', 'ROOM')),
  reference_image bytea,
  reference_mime  text check (reference_mime in ('image/jpeg', 'image/png')),
  updated_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint camera_positions_unique unique (device_id, position)
);

-- Seat zones are normalised rectangles (0..1) in camera image coordinates.
create table seat_zones (
  id           uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references classrooms(id) on delete cascade,
  label        text not null,
  x            real not null check (x between 0 and 1),
  y            real not null check (y between 0 and 1),
  w            real not null check (w > 0 and w <= 1),
  h            real not null check (h > 0 and h <= 1),
  student_id   uuid references students(id) on delete set null,
  constraint seat_zones_label_unique unique (classroom_id, label)
);

create table occupancy_events (
  id             bigint generated always as identity primary key,
  classroom_id   uuid not null references classrooms(id) on delete cascade,
  device_id      uuid references devices(id) on delete set null,
  people_count   integer not null check (people_count >= 0),
  occupied_seats text[] not null default '{}',
  hand_raised_seats text[] not null default '{}',
  source         text not null check (source in ('camera', 'csi', 'manual')),
  model_version  text,
  latency_ms     integer,
  recorded_at    timestamptz not null default now(),
  is_simulated   boolean not null default false
);
create index occupancy_events_room_time_idx on occupancy_events (classroom_id, recorded_at desc);

create table camera_health_logs (
  id          bigint generated always as identity primary key,
  device_id   uuid not null references devices(id) on delete cascade,
  status      text not null check (status in ('OK', 'COVERED', 'MOVED')),
  scores      jsonb not null default '{}'::jsonb,   -- measured scores used for the decision
  recorded_at timestamptz not null default now()
);
create index camera_health_logs_idx on camera_health_logs (device_id, recorded_at desc);

-- Metrics are written only by the training/evaluation scripts from real held-out tests.
create table model_metrics (
  id               bigint generated always as identity primary key,
  model_name       text not null check (model_name in ('hand_raise', 'csi_presence', 'csi_location', 'face_match', 'people_count')),
  -- dataset_summary must include per-class counts and the held-out fraction
  model_version    text not null,
  dataset_summary  jsonb not null,
  accuracy         real check (accuracy between 0 and 1),
  metrics          jsonb not null,
  confusion_matrix jsonb,
  labels           text[],
  latency_ms_p50   real,
  latency_ms_p95   real,
  trained_at       timestamptz not null default now(),
  constraint model_metrics_version_unique unique (model_name, model_version)
);

create table csi_samples (
  id           bigint generated always as identity primary key,
  device_id    uuid not null references devices(id) on delete cascade,
  seq          bigint,
  zone_label   text,
  rssi_dbm     integer,
  amplitudes   real[] not null,
  recorded_at  timestamptz not null,
  is_simulated boolean not null default false,
  constraint csi_samples_device_seq_unique unique (device_id, seq)
);
create index csi_samples_device_time_idx on csi_samples (device_id, recorded_at desc);

create table csi_predictions (
  id           bigint generated always as identity primary key,
  device_id    uuid not null references devices(id) on delete cascade,
  presence     boolean not null,
  zone_label   text,
  x            real,
  y            real,
  confidence   real,
  model_version text,
  recorded_at  timestamptz not null default now(),
  is_simulated boolean not null default false
);
create index csi_predictions_device_time_idx on csi_predictions (device_id, recorded_at desc);

-- FastRobox 1.0 — students, guardians, cards and Teacher tags, schedules, check-in,
-- attendance, face embeddings, private snapshots, guardian notices, weather.

create table students (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid unique references users(id) on delete set null,
  student_code     text not null unique check (student_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  full_name        text not null check (length(full_name) between 1 and 120),
  full_name_bn     text,
  classroom_id     uuid references classrooms(id) on delete set null,
  face_consent_at  timestamptz,
  face_consent_by  uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index students_classroom_idx on students (classroom_id);

create table guardian_student_links (
  guardian_id uuid not null references users(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  relation    text not null default 'guardian',
  primary key (guardian_id, student_id)
);
create index guardian_links_student_idx on guardian_student_links (student_id);

-- RFID UIDs are stored as upper-case hex without separators.
--  kind = 'student'     → a student card (check-in, Level 7)
--  kind = 'teacher_tag' → a Teacher tag (silences the fire buzzer, Level 3)
create table rfid_cards (
  id             uuid primary key default gen_random_uuid(),
  uid            text not null unique check (uid ~ '^[0-9A-F]{8,20}$'),
  kind           text not null default 'student' check (kind in ('student', 'teacher_tag')),
  student_id     uuid references students(id) on delete set null,
  user_id        uuid references users(id) on delete set null,
  label          text,
  status         text not null default 'active' check (status in ('active', 'lost', 'revoked')),
  blocked_until  timestamptz,                   -- Level 8 lockout (5 min) unless unblocked by Admin
  blocked_reason text,
  registered_by  uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (kind = 'student' or student_id is null)
);
create index rfid_cards_student_idx on rfid_cards (student_id);

-- Attendance windows (question paper, Level 7): Present within the first 10 minutes,
-- Late after that, Absent for anyone not checked in after 30 minutes. Stored per
-- schedule so a judge can change them; class times are chosen by the judge.
create table class_schedules (
  id                uuid primary key default gen_random_uuid(),
  classroom_id      uuid not null references classrooms(id) on delete cascade,
  teacher_id        uuid references users(id) on delete set null,
  subject           text not null,
  day_of_week       smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time        time not null,
  end_time          time not null,
  present_until_min integer not null default 10 check (present_until_min between 0 and 240),
  absent_after_min  integer not null default 30 check (absent_after_min between 1 and 480),
  timezone          text not null default 'Asia/Dhaka',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  check (end_time > start_time),
  check (absent_after_min > present_until_min)
);
create index class_schedules_room_idx on class_schedules (classroom_id, day_of_week);

create table attendance (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references students(id) on delete cascade,
  schedule_id       uuid not null references class_schedules(id) on delete cascade,
  class_date        date not null,
  status            text not null check (status in ('PRESENT', 'LATE', 'ABSENT')),
  first_seen_at     timestamptz,
  method            text not null check (method in ('CARD_FACE', 'OFFLINE_CARD', 'MANUAL', 'AUTO_ABSENT')),
  face_verified     boolean not null default false,
  card_id           uuid references rfid_cards(id) on delete set null,
  device_id         uuid references devices(id) on delete set null,
  is_offline_replay boolean not null default false,
  is_simulated      boolean not null default false,
  marked_by         uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint attendance_unique unique (student_id, schedule_id, class_date)
);
create index attendance_date_idx on attendance (class_date, schedule_id);

-- Every check-in decision, including denials and their reasons. Face images are
-- never stored here: only their size (the "log of images received for checking").
create table access_events (
  id                bigint generated always as identity primary key,
  device_id         uuid not null references devices(id) on delete cascade,
  classroom_id      uuid references classrooms(id) on delete set null,
  card_uid          text not null,
  card_id           uuid references rfid_cards(id) on delete set null,
  student_id        uuid references students(id) on delete cascade,
  decision          text not null check (decision in ('GRANTED', 'DENIED')),
  reason            text not null,
  attendance_id     uuid references attendance(id) on delete set null,
  face_w            integer check (face_w > 0),
  face_h            integer check (face_h > 0),
  face_bytes        integer check (face_bytes > 0),
  face_distance     real,
  liveness_score    real,
  tapped_at         timestamptz not null,
  is_offline_replay boolean not null default false,
  is_simulated      boolean not null default false,
  created_at        timestamptz not null default now()
);
create index access_events_device_time_idx on access_events (device_id, tapped_at desc);
create index access_events_card_reason_idx on access_events (card_id, reason, tapped_at desc);

-- Face embeddings only (never raw photos). Deleted with the student.
create table face_embeddings (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  model      text not null,
  dims       integer not null check (dims > 0 and dims <= 4096),
  embedding  real[] not null,
  quality    real,
  created_at timestamptz not null default now(),
  check (array_length(embedding, 1) = dims)
);
create index face_embeddings_student_idx on face_embeddings (student_id);

-- Private snapshots (FACE MISMATCH, INTRUDER, CAMERA FAULT). Teacher/Admin only.
-- A snapshot about a student's card is deleted with that student.
create table private_snapshots (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('FACE_MISMATCH', 'SPOOF', 'INTRUDER', 'CAMERA_FAULT')),
  device_id    uuid references devices(id) on delete set null,
  classroom_id uuid references classrooms(id) on delete cascade,
  student_id   uuid references students(id) on delete cascade,
  mime         text not null check (mime in ('image/jpeg', 'image/png')),
  width        integer,
  height       integer,
  image        bytea not null,
  created_at   timestamptz not null default now()
);
alter table alerts add constraint alerts_snapshot_fk foreign key (snapshot_id) references private_snapshots(id) on delete set null;

create table guardian_notifications (
  id            bigint generated always as identity primary key,
  guardian_id   uuid not null references users(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  attendance_id uuid references attendance(id) on delete cascade,
  kind          text not null check (kind in ('LATE', 'ABSENT', 'ARRIVED')),
  message       text not null,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  constraint guardian_notifications_unique unique (guardian_id, attendance_id, kind)
);
create index guardian_notifications_idx on guardian_notifications (guardian_id, created_at desc);

create table weather_cache (
  location_key text primary key,
  source       text not null,
  fetched_at   timestamptz not null,
  payload      jsonb not null,
  last_error   text,
  last_error_at timestamptz
);

-- Notices: official (from the provider), derived (worked out from the forecast and
-- labelled as such) or test (added/removed by the Admin).
create table weather_alerts (
  id           bigint generated always as identity primary key,
  location_key text not null,
  level        text not null check (level in ('ADVISORY', 'WARNING', 'DANGER')),
  kind         text not null check (kind in ('STORM', 'CYCLONE', 'HEAVY_RAIN', 'FLOOD', 'HEATWAVE', 'TEST')),
  origin       text not null check (origin in ('official', 'derived', 'test')),
  message      text not null,
  valid_from   timestamptz not null,
  valid_to     timestamptz,
  source       text not null,
  created_by   uuid references users(id) on delete set null,
  removed_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index weather_alerts_active_idx on weather_alerts (location_key, valid_from) where removed_at is null;
create unique index weather_alerts_dedupe on weather_alerts (location_key, kind, level, valid_from) where origin <> 'test';

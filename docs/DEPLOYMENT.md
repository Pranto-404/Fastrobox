# Deployment

Target: Vercel (web app + API) and Supabase (Postgres). **Not deployed yet**: deploying needs the
team's Vercel and Supabase accounts (see "What is needed" below).

## 1. Database (Supabase)

1. Create a Supabase project (region close to Bangladesh, e.g. Singapore).
2. Project Settings → Database → copy the **transaction pooler** connection string (port 6543).
3. Apply the migrations from your laptop:
   ```bash
   cd web && npm ci
   DATABASE_URL='postgres://…' npm run db:migrate
   ```
   (or `supabase db push` with the Supabase CLI; the files are in `supabase/migrations/`).
4. Create the first Admin:
   ```bash
   DATABASE_URL='postgres://…' BOOTSTRAP_ADMIN_USERNAME=admin BOOTSTRAP_ADMIN_PASSWORD='…' npm run seed -- --admin
   ```

## 2. Web app (Vercel)

1. Import the GitHub repository in Vercel, **Root Directory = `web`**, framework Next.js.
2. Environment variables (Production): `DATABASE_URL`, `APP_MODE=live`, `TELEGRAM_BOT_TOKEN`,
   `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_LOCATION_NAME`, `FACE_SERVICE_URL`,
   `FACE_SERVICE_TOKEN`, `CRON_SECRET`. Never set `BOOTSTRAP_*` on Vercel.
3. Deploy. The public HTTPS address is the device's server address.

## 3. Phone alerts (Telegram)

1. Create a bot with @BotFather, put its token in `TELEGRAM_BOT_TOKEN`.
2. Each Teacher opens the bot and sends `/start`; get the chat id (e.g. via `getUpdates`) and enter it
   for that user on Admin → Users.

## 4. Before judging (Level 4 task 8)

Create the judges' accounts (Admin, Teacher, Student S1, Student S2, Guardian linked to S1) with
`npm run seed -- --file judges.local.json` (git-ignored) or on Admin → Users / Students, register the
device, and give the judges the addresses: `/login`, `/dashboard`, `/rooms/<id>`, `/alerts`,
`/admin/settings`, `/students/<S1 id>`.

## What is needed from the team (blockers)

| Item | Why |
|---|---|
| Vercel account access | to deploy the public HTTPS site |
| Supabase project + connection string | production database |
| Telegram bot token + teachers' chat ids | Level 4 phone alerts |
| Hosting for the Python face/vision service | Levels 7–11 (not serverless) |

/**
 * Weather (Level 6). Source: Open-Meteo forecast API (public, no key; the server
 * fetches it, the browser never calls it). Fetched at most every
 * WEATHER_CACHE_MINUTES (default 15) and cached in weather_cache. If the service
 * fails, the last data is served with its age and stale=true — never an error page.
 *
 * Open-Meteo has no official warnings feed, so notices are WORKED OUT FROM THE
 * FORECAST and stored with origin='derived' (shown as "derived from forecast").
 * Thresholds (documented for the write-up):
 *   HEATWAVE   apparent temperature max ≥ 35 / 38 / 41 °C → ADVISORY / WARNING / DANGER
 *   HEAVY_RAIN 24 h precipitation ≥ 23 / 44 / 89 mm     → ADVISORY / WARNING / DANGER (BMD rain categories)
 *   STORM      wind gusts ≥ 40 / 62 / 89 km/h            → ADVISORY / WARNING / DANGER
 *              thunderstorm weather codes (95–99)        → at least WARNING
 * Admins can add/remove TEST notices.
 */
import { db } from "./db";
import { config } from "./env";
import { serverEvent } from "./events";

export interface WeatherPayload {
  location: string;
  current: { time: string; temp_c: number; rh: number; apparent_c: number; precip_mm: number; wind_kmh: number; code: number };
  hourly: { time: string; temp_c: number; rh: number; apparent_c: number; precip_mm: number; precip_prob: number; gust_kmh: number; code: number }[];
  line: string;
}

const CODE_TEXT: Record<number, string> = {
  0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle",
  55: "dense drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 80: "rain showers", 81: "rain showers",
  82: "violent showers", 95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
};
export const weatherText = (code: number) => CODE_TEXT[code] ?? `code ${code}`;

const locationKey = () => `${config().WEATHER_LATITUDE.toFixed(3)},${config().WEATHER_LONGITUDE.toFixed(3)}`;
const SOURCE = "Open-Meteo (open-meteo.com)";

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...a) => fetch(...a);
export function setWeatherFetcher(f: Fetcher | null) {
  fetcher = f ?? ((...a) => fetch(...a));
}

export async function fetchOpenMeteo(): Promise<WeatherPayload> {
  const c = config();
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(c.WEATHER_LATITUDE));
  url.searchParams.set("longitude", String(c.WEATHER_LONGITUDE));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code");
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,precipitation_probability,wind_gusts_10m,weather_code");
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("timezone", "UTC");
  const res = await fetcher(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
  const j = (await res.json()) as {
    current: Record<string, number | string>;
    hourly: Record<string, (number | string)[]>;
  };
  const h = j.hourly;
  const hourly = (h.time as string[]).slice(0, 24).map((time, i) => ({
    time: `${time}Z`,
    temp_c: Number(h.temperature_2m[i]), rh: Number(h.relative_humidity_2m[i]), apparent_c: Number(h.apparent_temperature[i]),
    precip_mm: Number(h.precipitation[i] ?? 0), precip_prob: Number(h.precipitation_probability[i] ?? 0),
    gust_kmh: Number(h.wind_gusts_10m[i] ?? 0), code: Number(h.weather_code[i]),
  }));
  const cur = j.current;
  const current = {
    time: `${cur.time}Z`, temp_c: Number(cur.temperature_2m), rh: Number(cur.relative_humidity_2m),
    apparent_c: Number(cur.apparent_temperature), precip_mm: Number(cur.precipitation), wind_kmh: Number(cur.wind_speed_10m),
    code: Number(cur.weather_code),
  };
  if (![current.temp_c, current.rh].every(Number.isFinite) || !hourly.length) throw new Error("weather response incomplete");
  return {
    location: c.WEATHER_LOCATION_NAME,
    current,
    hourly,
    line: `${c.WEATHER_LOCATION_NAME} ${current.temp_c.toFixed(0)}°C, ${current.rh.toFixed(0)}% RH, ${weatherText(current.code)}`,
  };
}

type Level = "ADVISORY" | "WARNING" | "DANGER";
export interface DerivedNotice { kind: "HEATWAVE" | "HEAVY_RAIN" | "STORM"; level: Level; message: string; valid_from: string; valid_to: string }

const lvl = (v: number, [a, w, d]: [number, number, number]): Level | null => (v >= d ? "DANGER" : v >= w ? "WARNING" : v >= a ? "ADVISORY" : null);

/** Notices worked out from the 24-hour forecast (pure function, unit-tested). */
export function deriveNotices(w: WeatherPayload): DerivedNotice[] {
  const out: DerivedNotice[] = [];
  const from = w.hourly[0]?.time ?? w.current.time;
  const to = w.hourly[w.hourly.length - 1]?.time ?? from;
  const hourStart = (t: string) => new Date(t).toISOString();
  const maxApp = Math.max(...w.hourly.map((x) => x.apparent_c));
  const heat = lvl(maxApp, [35, 38, 41]);
  if (heat) {
    const first = w.hourly.find((x) => x.apparent_c >= (heat === "DANGER" ? 41 : heat === "WARNING" ? 38 : 35))!;
    out.push({ kind: "HEATWAVE", level: heat, message: `Heatwave: feels like up to ${maxApp.toFixed(0)}°C in the next 24 h (derived from forecast)`, valid_from: hourStart(first.time), valid_to: to });
  }
  const rain = w.hourly.reduce((a, x) => a + x.precip_mm, 0);
  const rainLvl = lvl(rain, [23, 44, 89]);
  if (rainLvl) out.push({ kind: "HEAVY_RAIN", level: rainLvl, message: `Heavy rain: ${rain.toFixed(0)} mm expected in 24 h (derived from forecast)`, valid_from: hourStart(from), valid_to: to });
  const gust = Math.max(...w.hourly.map((x) => x.gust_kmh));
  let storm = lvl(gust, [40, 62, 89]);
  const thunder = w.hourly.some((x) => x.code >= 95);
  if (thunder && (!storm || storm === "ADVISORY")) storm = "WARNING";
  if (storm) {
    const first = w.hourly.find((x) => x.gust_kmh >= 40 || x.code >= 95) ?? w.hourly[0];
    out.push({ kind: "STORM", level: storm, message: `Storm: gusts up to ${gust.toFixed(0)} km/h${thunder ? ", thunderstorms" : ""} (derived from forecast)`, valid_from: hourStart(first.time), valid_to: to });
  }
  return out;
}

/** Fetches if the cache is older than the refresh interval; never throws. */
export async function refreshWeather(force = false): Promise<void> {
  const key = locationKey();
  const sql = db();
  const [c] = await sql<{ fetched_at: Date; last_error_at: Date | null }[]>`select fetched_at, last_error_at from weather_cache where location_key = ${key}`;
  const maxAgeMs = config().WEATHER_CACHE_MINUTES * 60_000;
  const lastTry = Math.max(c?.fetched_at.getTime() ?? 0, c?.last_error_at?.getTime() ?? 0);
  if (!force && Date.now() - lastTry < maxAgeMs) return;
  try {
    const w = await fetchOpenMeteo();
    await sql.begin(async (tx) => {
      await tx`insert into weather_cache (location_key, source, fetched_at, payload) values (${key}, ${SOURCE}, now(), ${tx.json(w as never)})
               on conflict (location_key) do update set source = excluded.source, fetched_at = now(), payload = excluded.payload,
                      last_error = null, last_error_at = null`;
      const notices = deriveNotices(w);
      // Derived notices no longer in the forecast are removed.
      await tx`update weather_alerts set removed_at = now()
                where location_key = ${key} and origin = 'derived' and removed_at is null
                  and not ((kind, level) in (select * from unnest(${notices.map((n) => n.kind)}::text[], ${notices.map((n) => n.level)}::text[])))`;
      for (const n of notices) {
        const [row] = await tx<{ id: number; inserted: boolean }[]>`
          insert into weather_alerts (location_key, level, kind, origin, message, valid_from, valid_to, source)
          select ${key}, ${n.level}, ${n.kind}, 'derived', ${n.message}, date_trunc('hour', ${n.valid_from}::timestamptz), ${n.valid_to}, ${SOURCE}
           where not exists (select 1 from weather_alerts where location_key = ${key} and origin = 'derived' and kind = ${n.kind}
                               and level = ${n.level} and removed_at is null)
          on conflict do nothing
          returning id, true as inserted`;
        if (row && n.level === "DANGER") {
          await serverEvent(tx, { deviceId: null, classroomId: null, roomId: null, type: "WEATHER_ALERT", severity: "critical", detail: `DANGER ${n.message}` });
        }
      }
    });
  } catch (e) {
    await sql`insert into weather_cache (location_key, source, fetched_at, payload, last_error, last_error_at)
              values (${key}, ${SOURCE}, 'epoch', '{}'::jsonb, ${(e as Error).message.slice(0, 200)}, now())
              on conflict (location_key) do update set last_error = excluded.last_error, last_error_at = now()`;
  }
}

export async function weatherView() {
  const key = locationKey();
  const [c] = await db()<{ fetched_at: Date; payload: WeatherPayload | Record<string, never>; source: string; last_error: string | null; last_error_at: Date | null }[]>`
    select fetched_at, payload, source, last_error, last_error_at from weather_cache where location_key = ${key}`;
  const notices = await db()<{ id: number; level: Level; kind: string; origin: string; message: string; valid_from: Date; valid_to: Date | null; source: string }[]>`
    select id, level, kind, origin, message, valid_from, valid_to, source from weather_alerts
     where removed_at is null and (valid_to is null or valid_to > now())
     order by case level when 'DANGER' then 0 when 'WARNING' then 1 else 2 end, created_at desc`;
  const has = Boolean(c && "current" in c.payload);
  const ageS = has ? Math.round((Date.now() - c.fetched_at.getTime()) / 1000) : null;
  const staleAfter = config().WEATHER_CACHE_MINUTES * 60 * 2;
  return {
    data: has ? (c.payload as WeatherPayload) : null,
    source: c?.source ?? SOURCE,
    fetched_at: has ? c.fetched_at.toISOString() : null,
    age_s: ageS,
    stale: !has || (ageS ?? 0) > staleAfter || Boolean(c?.last_error && c.last_error_at && c.last_error_at > c.fetched_at),
    error: c?.last_error ?? null,
    notices: notices.map((n) => ({ ...n, valid_from: n.valid_from.toISOString(), valid_to: n.valid_to?.toISOString() ?? null })),
  };
}

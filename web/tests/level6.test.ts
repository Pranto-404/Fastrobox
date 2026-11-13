import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ask, parseDate, parseIntent } from "@/lib/assistant";
import { dailyReport, toCsv } from "@/lib/reports";
import { deriveNotices, refreshWeather, setWeatherFetcher, weatherView, type WeatherPayload } from "@/lib/weather";
import { POST as telemetryPOST } from "@/app/api/device/v1/telemetry/route";
import { POST as eventsPOST } from "@/app/api/device/v1/events/route";
import { deviceReq, event, makeDevice, noCtx, nowS, resetDb, telemetry } from "./helpers";

let room = "";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());

beforeEach(async () => {
  await resetDb();
  const d = await makeDevice();
  let seq = 1;
  for (const [temp, rh, status] of [[29, 60, "SAFE"], [33.5, 62, "WARNING"], [41.2, 55, "DANGER"], [30, 58, "WARNING"]] as const) {
    await telemetryPOST(deviceReq("/api/device/v1/telemetry", d.token, telemetry(seq++, { temp_c: temp, rh, status, ts: nowS() - 100 + seq })), noCtx);
  }
  // a bad reading must never count as a real reading
  await telemetryPOST(deviceReq("/api/device/v1/telemetry", d.token, telemetry(seq++, { temp_c: 99, rh: 5, quality: "bad", status: "WARNING" })), noCtx);
  await eventsPOST(deviceReq("/api/device/v1/events", d.token, event(seq++, "FIRE", "flame 2s")), noCtx);
  await eventsPOST(deviceReq("/api/device/v1/events", d.token, event(seq++, "PANIC", "touch 2s")), noCtx);
  room = (await db()`select id from classrooms where room_code = 'R-305'`)[0].id;
});

afterEach(() => setWeatherFetcher(null));

describe("daily report", () => {
  it("min/max/avg from good readings only, alarms per type", async () => {
    const r = (await dailyReport(room, today))!;
    expect(r.readings).toBe(4);
    expect(r.temp).toMatchObject({ min: 29, max: 41.2, avg: 33.4 });
    expect(r.alarms).toMatchObject({ FIRE: 1, PANIC: 1, HEAT_DANGER: 1 });
    expect(r.attendance).toEqual({ PRESENT: 0, LATE: 0, ABSENT: 0 });
  });
});

describe("AI assistant", () => {
  it("parses English and Bangla questions", () => {
    expect(parseIntent("What was today's highest temperature?")).toEqual({ kind: "metric", metric: "temp", agg: "max" });
    expect(parseIntent("How many fire alerts occurred today?")).toEqual({ kind: "alarms", type: "FIRE" });
    expect(parseIntent("How many students were absent?")).toEqual({ kind: "attendance", status: "ABSENT" });
    expect(parseIntent("When did the last panic event occur?")).toEqual({ kind: "last", type: "PANIC" });
    expect(parseIntent("আজ সর্বোচ্চ তাপমাত্রা কত ছিল?")).toEqual({ kind: "metric", metric: "temp", agg: "max" });
    expect(parseIntent("আজ কয়টি আগুনের অ্যালার্ম হয়েছে?")).toEqual({ kind: "alarms", type: "FIRE" });
    expect(parseIntent("সর্বশেষ জরুরি সংকেত কখন হয়েছিল?")).toEqual({ kind: "last", type: "PANIC" });
    expect(parseDate("on ২০২৫-০১-০৫")).toBe("2025-01-05");
    expect(parseDate("on 05/01/2025")).toBe("2025-01-05");
  });

  it("answers match the daily report (English and Bangla)", async () => {
    const r = (await dailyReport(room, today))!;
    const a1 = await ask("What was today's highest temperature?", room);
    expect(a1.answer).toContain(`${r.temp.max} °C`);
    expect(a1.no_data).toBe(false);
    expect(a1.time_range?.from).toBe(`${today}T00:00:00`);
    const a2 = await ask("How many fire alerts occurred today?", room);
    expect(a2.answer).toBe(`1 fire alarm(s) on ${today}.`);
    const a3 = await ask("আজ সর্বোচ্চ তাপমাত্রা কত ছিল?", room);
    expect(a3.lang).toBe("bn");
    expect(a3.answer).toContain("41.2");
    const a4 = await ask("When did the last panic event occur?", room);
    expect(a4.answer).toMatch(/The last panic event was at/);
    expect(a4.sources[0]).toMatch(/^device_events #\d+$/);
  });

  it("a date with no data is answered 'no data' and nothing is invented", async () => {
    const a = await ask("What was the highest temperature on 2025-01-05?", room);
    expect(a.no_data).toBe(true);
    expect(a.answer).toMatch(/^No data for 2025-01-05/);
    expect(a.answer).not.toMatch(/\d+(\.\d+)? °C/);
    const b = await ask("How many students were absent on 2025-01-05?", room);
    expect(b.no_data).toBe(true);
    const c = await ask("২০২৫-০১-০৫ তারিখে কতজন অনুপস্থিত ছিল?", room);
    expect(c.answer).toMatch(/কোনো তথ্য নেই/);
  });

  it("refuses unrelated questions without making things up", async () => {
    const a = await ask("Write me a poem about rain", room);
    expect(a.intent).toBe("unknown");
    expect(a.sources).toEqual([]);
  });
});

const sample = (over: Partial<WeatherPayload["hourly"][number]> = {}): WeatherPayload => ({
  location: "Dhaka",
  current: { time: "2026-11-13T05:00Z", temp_c: 30, rh: 70, apparent_c: 34, precip_mm: 0, wind_kmh: 10, code: 2 },
  hourly: Array.from({ length: 24 }, (_, i) => ({ time: `2026-11-13T${String(i).padStart(2, "0")}:00Z`, temp_c: 30, rh: 70, apparent_c: 33, precip_mm: 0, precip_prob: 10, gust_kmh: 20, code: 2, ...over })),
  line: "Dhaka 30°C",
});

describe("weather notices derived from the forecast", () => {
  it("nothing for calm weather; storm/heat/rain levels by documented thresholds", () => {
    expect(deriveNotices(sample())).toEqual([]);
    expect(deriveNotices(sample({ gust_kmh: 95 }))[0]).toMatchObject({ kind: "STORM", level: "DANGER" });
    expect(deriveNotices(sample({ code: 95 }))[0]).toMatchObject({ kind: "STORM", level: "WARNING" });
    expect(deriveNotices(sample({ apparent_c: 39 }))[0]).toMatchObject({ kind: "HEATWAVE", level: "WARNING" });
    expect(deriveNotices(sample({ precip_mm: 4 }))[0]).toMatchObject({ kind: "HEAVY_RAIN", level: "DANGER" }); // 96 mm/24 h
  });

  it("serves the last data with its age and 'stale' when the service fails", async () => {
    const om = (s: WeatherPayload) => ({
      current: { time: "2026-11-13T05:00", temperature_2m: s.current.temp_c, relative_humidity_2m: 70, apparent_temperature: 34, precipitation: 0, wind_speed_10m: 10, weather_code: 2 },
      hourly: {
        time: s.hourly.map((h) => h.time.replace("Z", "")), temperature_2m: s.hourly.map(() => 30), relative_humidity_2m: s.hourly.map(() => 70),
        apparent_temperature: s.hourly.map(() => 33), precipitation: s.hourly.map(() => 0), precipitation_probability: s.hourly.map(() => 0),
        wind_gusts_10m: s.hourly.map(() => 95), weather_code: s.hourly.map(() => 2),
      },
    });
    setWeatherFetcher((async () => new Response(JSON.stringify(om(sample())))) as typeof fetch);
    await refreshWeather(true);
    let v = await weatherView();
    expect(v.data?.current.temp_c).toBe(30);
    expect(v.stale).toBe(false);
    expect(v.notices.map((n) => [n.kind, n.level, n.origin])).toEqual([["STORM", "DANGER", "derived"]]);
    expect((await db()`select count(*)::int as n from device_events where event_type = 'WEATHER_ALERT'`)[0].n).toBe(1);

    setWeatherFetcher((async () => { throw new Error("blocked"); }) as typeof fetch);
    await refreshWeather(true);
    v = await weatherView();
    expect(v.data?.current.temp_c).toBe(30); // last data kept
    expect(v.stale).toBe(true);
    expect(v.age_s).not.toBeNull();
  });
});

describe("CSV export", () => {
  it("escapes quotes/commas and neutralises spreadsheet formulas", () => {
    const csv = toCsv([{ a: 'x,"y"', b: "=HYPERLINK(1)", c: -3.5, d: null }], ["a", "b", "c", "d"]);
    expect(csv).toBe('a,b,c,d\r\n"x,""y""",\'=HYPERLINK(1),-3.5,\r\n');
  });
});

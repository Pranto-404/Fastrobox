/**
 * AI classroom assistant (Level 6, task 10).
 *
 * Kept to the stored data by construction: the question is mapped to an intent
 * and a date, the answer is computed with the same queries as the daily report
 * (lib/reports.ts), and the reply quotes the time range and the source records.
 * If the records do not exist the answer is "no data" — nothing is generated
 * free-form, so nothing can be invented. English and Bangla are both supported.
 */
import { db } from "./db";
import { isDemoMode } from "./env";
import { dailyReport, TZ } from "./reports";

export type Lang = "en" | "bn";
type Metric = "temp" | "rh";
type Agg = "max" | "min" | "avg";
export type Intent =
  | { kind: "metric"; metric: Metric; agg: Agg }
  | { kind: "alarms"; type: "ALL" | "FIRE" | "PANIC" | "HEAT_DANGER" | "HEAT_WARNING" }
  | { kind: "attendance"; status: "PRESENT" | "LATE" | "ABSENT" }
  | { kind: "last"; type: "FIRE" | "PANIC" }
  | { kind: "unknown" };

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toLatinDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

export function detectLang(q: string): Lang {
  return /[ঀ-৿]/.test(q) ? "bn" : "en";
}

export function parseIntent(raw: string): Intent {
  const q = toLatinDigits(raw.toLowerCase());
  const has = (...w: string[]) => w.some((x) => q.includes(x));
  const isLast = has("last", "latest", "most recent", "when did", "সর্বশেষ", "শেষ কবে", "শেষবার", "কখন", "কবে");
  const fire = has("fire", "flame", "আগুন");
  const panic = has("panic", "প্যানিক", "জরুরি");
  if (isLast && (fire || panic) && !has("how many", "number of", "count", "কতবার", "কয়টি", "কতটি")) {
    return { kind: "last", type: fire ? "FIRE" : "PANIC" };
  }
  if (has("absent", "অনুপস্থিত")) return { kind: "attendance", status: "ABSENT" };
  if (has("late", "দেরি", "দেরিতে")) return { kind: "attendance", status: "LATE" };
  if (has("present", "উপস্থিত")) return { kind: "attendance", status: "PRESENT" };
  if (fire) return { kind: "alarms", type: "FIRE" };
  if (panic) return { kind: "alarms", type: "PANIC" };
  if (has("heat danger", "danger", "বিপদ")) return { kind: "alarms", type: "HEAT_DANGER" };
  if (has("heat warning", "warning", "সতর্কতা")) return { kind: "alarms", type: "HEAT_WARNING" };
  if (has("alarm", "alert", "অ্যালার্ম", "এলার্ম", "সতর্কবার্তা")) return { kind: "alarms", type: "ALL" };
  const metric: Metric | null = has("humid", "rh", "আর্দ্রতা") ? "rh" : has("temp", "hot", "warm", "cold", "তাপমাত্রা", "তাপ", "গরম") ? "temp" : null;
  if (metric) {
    const agg: Agg = has("lowest", "minimum", "min", "coldest", "সর্বনিম্ন", "সবচেয়ে কম", "নিম্ন")
      ? "min"
      : has("average", "avg", "mean", "গড়")
        ? "avg"
        : "max";
    return { kind: "metric", metric, agg };
  }
  return { kind: "unknown" };
}

/** Resolves "today", "yesterday", YYYY-MM-DD or DD/MM/YYYY (school time zone). */
export function parseDate(raw: string, now = new Date()): string {
  const q = toLatinDigits(raw.toLowerCase());
  const local = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(q);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(q);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (q.includes("yesterday") || q.includes("গতকাল")) return local(new Date(now.getTime() - 86_400_000));
  return local(now);
}

export interface AssistantAnswer {
  answer: string;
  lang: Lang;
  intent: Intent["kind"];
  no_data: boolean;
  time_range: { from: string; to: string; timezone: string } | null;
  sources: string[];
}

const L = {
  en: {
    noData: (d: string) => `No data for ${d}. Nothing is recorded for that, so I cannot answer.`,
    unknown: "I can only answer from this room's stored data: highest/lowest/average temperature or humidity, number of alarms (fire, panic, heat), attendance (present, late, absent) and when the last fire or panic happened.",
    metric: (m: Metric, a: Agg, v: number, d: string, at: string | null) =>
      `The ${a === "max" ? "highest" : a === "min" ? "lowest" : "average"} ${m === "temp" ? "temperature" : "humidity"} on ${d} was ${v}${m === "temp" ? " °C" : " %"}${at ? ` (at ${at})` : ""}.`,
    alarms: (t: string, n: number, d: string) => `${n} ${t === "ALL" ? "alarm(s)" : `${t.replace("_", " ").toLowerCase()} alarm(s)`} on ${d}.`,
    att: (s: string, n: number, d: string) => `${n} student(s) ${s.toLowerCase()} on ${d}.`,
    last: (t: string, at: string, detail: string) => `The last ${t.toLowerCase()} event was at ${at}${detail ? ` (${detail})` : ""}.`,
    noEvent: (t: string) => `No data: there is no ${t.toLowerCase()} event recorded for this room.`,
  },
  bn: {
    noData: (d: string) => `${d} তারিখের কোনো তথ্য নেই। এ বিষয়ে কিছু সংরক্ষিত নেই, তাই উত্তর দেওয়া সম্ভব নয়।`,
    unknown: "আমি শুধু এই কক্ষের সংরক্ষিত তথ্য থেকে উত্তর দিতে পারি: সর্বোচ্চ/সর্বনিম্ন/গড় তাপমাত্রা বা আর্দ্রতা, অ্যালার্মের সংখ্যা (আগুন, জরুরি সংকেত, তাপ), উপস্থিতি (উপস্থিত, দেরি, অনুপস্থিত) এবং সর্বশেষ আগুন বা জরুরি সংকেত কখন হয়েছিল।",
    metric: (m: Metric, a: Agg, v: number, d: string, at: string | null) =>
      `${d} তারিখে ${a === "max" ? "সর্বোচ্চ" : a === "min" ? "সর্বনিম্ন" : "গড়"} ${m === "temp" ? "তাপমাত্রা" : "আর্দ্রতা"} ছিল ${v}${m === "temp" ? " °সে" : " %"}${at ? ` (${at}-এ)` : ""}।`,
    alarms: (t: string, n: number, d: string) => `${d} তারিখে ${t === "ALL" ? "মোট" : t === "FIRE" ? "আগুনের" : t === "PANIC" ? "জরুরি সংকেতের" : t === "HEAT_DANGER" ? "তাপ বিপদের" : "তাপ সতর্কতার"} অ্যালার্ম ${n}টি।`,
    att: (s: string, n: number, d: string) => `${d} তারিখে ${n} জন শিক্ষার্থী ${s === "PRESENT" ? "উপস্থিত" : s === "LATE" ? "দেরিতে এসেছে" : "অনুপস্থিত"}।`,
    last: (t: string, at: string, detail: string) => `সর্বশেষ ${t === "FIRE" ? "আগুনের" : "জরুরি সংকেতের"} ঘটনা ঘটেছে ${at}-এ${detail ? ` (${detail})` : ""}।`,
    noEvent: (t: string) => `কোনো তথ্য নেই: এই কক্ষে কোনো ${t === "FIRE" ? "আগুনের" : "জরুরি সংকেতের"} ঘটনা সংরক্ষিত নেই।`,
  },
};

const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: TZ });

export async function ask(question: string, classroomId: string, now = new Date()): Promise<AssistantAnswer> {
  const lang = detectLang(question);
  const s = L[lang];
  const intent = parseIntent(question);
  const date = parseDate(question, now);
  const range = { from: `${date}T00:00:00`, to: `${date}T23:59:59`, timezone: TZ };
  const base = { lang, intent: intent.kind };

  if (intent.kind === "unknown") return { ...base, answer: s.unknown, no_data: false, time_range: null, sources: [] };

  if (intent.kind === "last") {
    const [e] = await db()<{ id: number; recorded_at: Date; detail: string }[]>`
      select e.id, e.recorded_at, e.detail from device_events e left join devices d on d.id = e.device_id
       where coalesce(e.classroom_id, d.classroom_id) = ${classroomId} and e.event_type = ${intent.type}
         and (${isDemoMode()} or not e.is_simulated)
       order by e.recorded_at desc limit 1`;
    if (!e) return { ...base, answer: s.noEvent(intent.type), no_data: true, time_range: null, sources: [] };
    return { ...base, answer: s.last(intent.type, fmtTime(e.recorded_at.toISOString()), e.detail), no_data: false, time_range: null, sources: [`device_events #${e.id}`] };
  }

  const r = await dailyReport(classroomId, date);
  if (!r) return { ...base, answer: s.noData(date), no_data: true, time_range: range, sources: [] };
  const src = [`daily report ${r.room_code} ${date}`];

  if (intent.kind === "metric") {
    if (r.readings === 0) return { ...base, answer: s.noData(date), no_data: true, time_range: range, sources: [] };
    const block = intent.metric === "temp" ? r.temp : r.rh;
    const v = block[intent.agg];
    if (v == null) return { ...base, answer: s.noData(date), no_data: true, time_range: range, sources: [] };
    const at = intent.metric === "temp" && intent.agg === "max" && r.temp.max_at ? fmtTime(r.temp.max_at) : null;
    return { ...base, answer: s.metric(intent.metric, intent.agg, v, date, at), no_data: false, time_range: range, sources: [...src, `${r.readings} telemetry records`] };
  }

  // Counts: a day without any stored record at all is "no data", not "0".
  const anyRecord = r.readings > 0 || Object.values(r.alarms).some((n) => n > 0) || Object.values(r.attendance).some((n) => n > 0);
  if (!anyRecord) return { ...base, answer: s.noData(date), no_data: true, time_range: range, sources: [] };
  if (intent.kind === "alarms") {
    const n = intent.type === "ALL" ? Object.values(r.alarms).reduce((a, b) => a + b, 0) : r.alarms[intent.type] ?? 0;
    return { ...base, answer: s.alarms(intent.type, n, date), no_data: false, time_range: range, sources: [...src, "alerts table"] };
  }
  return { ...base, answer: s.att(intent.status, r.attendance[intent.status], date), no_data: false, time_range: range, sources: [...src, "attendance table"] };
}

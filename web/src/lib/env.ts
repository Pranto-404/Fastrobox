import { z } from "zod";

/**
 * Server-side configuration. Never import this from client components.
 * APP_MODE switches between DEMO (simulated devices allowed, all simulated data
 * labelled "SIMULATED DATA") and LIVE (simulated devices are rejected and hidden).
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_MODE: z.enum(["demo", "live"]).default("live"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  WEATHER_LATITUDE: z.coerce.number().min(-90).max(90).default(23.8103),
  WEATHER_LONGITUDE: z.coerce.number().min(-180).max(180).default(90.4125),
  WEATHER_LOCATION_NAME: z.string().default("Dhaka"),
  WEATHER_CACHE_MINUTES: z.coerce.number().int().min(1).max(720).default(15),
  APP_TIMEZONE: z.string().default("Asia/Dhaka"),
  OTA_MAX_BYTES: z.coerce.number().int().min(1024).default(4 * 1024 * 1024),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isDemoMode(): boolean {
  return config().APP_MODE === "demo";
}

/** For tests only. */
export function resetConfigCache() {
  cached = null;
}

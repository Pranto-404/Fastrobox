/**
 * Safety rules from the FastRobox 1.0 question paper (Levels 3 and 5).
 *
 * The ESP32 is the authority for these decisions on the device (light, buzzer,
 * door). The server stores what the device reports. This module is the reference
 * implementation used by the simulator, the dashboard helpers and the tests, and
 * documents the exact rules the firmware must implement:
 *
 *  - Enter WARNING at temp ≥ warning limit (default 32 °C) OR humidity ≥ 85 %.
 *  - Enter DANGER at temp ≥ danger limit (default 40 °C).
 *  - Leave each state 2 °C below its limit (DANGER at ≤ 38 °C, WARNING at ≤ 30 °C)
 *    and, for WARNING, with humidity ≤ 80 %.
 *  - A new status counts only after holding for 3 seconds.
 *  - A reading outside 0–50 °C or 20–90 % RH is "bad": quality=bad, keep the last
 *    status, never use it as a real reading.
 *  - FIRE (flame seen continuously for 2 s) overrides everything, without the hold.
 *  - Heat never changes the door; the trend never changes light, buzzer or door.
 */
import { z } from "zod";

export const STATUSES = ["SAFE", "WARNING", "DANGER", "FIRE"] as const;
export type Status = (typeof STATUSES)[number];
export type ThermalStatus = Exclude<Status, "FIRE">;

export const HEAT_TRENDS = ["RISING", "STABLE", "FALLING"] as const;
export type HeatTrend = (typeof HEAT_TRENDS)[number];

export const HYSTERESIS_C = 2;
export const HUMIDITY_WARNING_ENTER = 85;
export const HUMIDITY_WARNING_LEAVE = 80;
export const STATUS_HOLD_MS = 3000;
export const VALID_TEMP = { min: 0, max: 50 } as const;
export const VALID_RH = { min: 20, max: 90 } as const;

/** Remote-configurable limits (Level 5): 0–50 °C, Warning below Danger. */
export const deviceSettingsSchema = z
  .strictObject({
    temp_warning_c: z
      .number({ error: "Warning limit must be a number" })
      .min(0, "Warning limit must be between 0 and 50 °C")
      .max(50, "Warning limit must be between 0 and 50 °C"),
    temp_danger_c: z
      .number({ error: "Danger limit must be a number" })
      .min(0, "Danger limit must be between 0 and 50 °C")
      .max(50, "Danger limit must be between 0 and 50 °C"),
  })
  .refine((s) => s.temp_warning_c < s.temp_danger_c, {
    message: "The Warning limit must be below the Danger limit",
    path: ["temp_warning_c"],
  });
export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = { temp_warning_c: 32, temp_danger_c: 40 };

export function isValidReading(tempC: number | null | undefined, rh: number | null | undefined): boolean {
  return (
    tempC != null && rh != null && Number.isFinite(tempC) && Number.isFinite(rh) &&
    tempC >= VALID_TEMP.min && tempC <= VALID_TEMP.max && rh >= VALID_RH.min && rh <= VALID_RH.max
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Heat index (°C), US NWS/NOAA algorithm: Steadman's simple formula, and the
 * Rothfusz regression with the low/high-humidity adjustments when ≥ 80 °F.
 */
export function heatIndexC(tempC: number | null | undefined, rh: number | null | undefined): number | null {
  if (tempC == null || rh == null || !Number.isFinite(tempC) || !Number.isFinite(rh) || rh < 0 || rh > 100) return null;
  const T = tempC * 1.8 + 32;
  const simple = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + rh * 0.094);
  let hiF: number;
  if ((simple + T) / 2 < 80) {
    hiF = simple;
  } else {
    hiF =
      -42.379 + 2.04901523 * T + 10.14333127 * rh - 0.22475541 * T * rh - 0.00683783 * T * T -
      0.05481717 * rh * rh + 0.00122874 * T * T * rh + 0.00085282 * T * rh * rh - 0.00000199 * T * T * rh * rh;
    if (rh < 13 && T >= 80 && T <= 112) hiF -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (rh > 85 && T >= 80 && T <= 87) hiF += ((rh - 85) / 10) * ((87 - T) / 5);
  }
  return round1((hiF - 32) / 1.8);
}

/** Target thermal status for one valid reading, given the current status (hysteresis). */
export function thermalTarget(current: ThermalStatus, tempC: number, rh: number, s: DeviceSettings): ThermalStatus {
  if (tempC >= s.temp_danger_c) return "DANGER";
  if (current === "DANGER" && tempC > s.temp_danger_c - HYSTERESIS_C) return "DANGER";
  const warnEnter = tempC >= s.temp_warning_c || rh >= HUMIDITY_WARNING_ENTER;
  if (warnEnter) return "WARNING";
  if (current === "DANGER" || current === "WARNING") {
    const canLeaveWarning = tempC <= s.temp_warning_c - HYSTERESIS_C && rh <= HUMIDITY_WARNING_LEAVE;
    return canLeaveWarning ? "SAFE" : "WARNING";
  }
  return "SAFE";
}

/**
 * Status machine with the 3-second hold. Feed readings in time order.
 * Bad readings keep the last status. FIRE is applied immediately by the caller.
 */
export class StatusMachine {
  status: ThermalStatus = "SAFE";
  private pending: { target: ThermalStatus; since: number } | null = null;

  constructor(private settings: DeviceSettings = DEFAULT_DEVICE_SETTINGS) {}

  setSettings(s: DeviceSettings) {
    this.settings = s;
  }

  /** Returns the change {from,to} if the status changed at time t (ms), else null. */
  update(t: number, tempC: number | null, rh: number | null): { from: ThermalStatus; to: ThermalStatus } | null {
    if (!isValidReading(tempC, rh)) return null; // quality=bad: keep the last status
    const target = thermalTarget(this.status, tempC as number, rh as number, this.settings);
    if (target === this.status) {
      this.pending = null;
      return null;
    }
    if (!this.pending || this.pending.target !== target) {
      this.pending = { target, since: t };
      return null;
    }
    if (t - this.pending.since >= STATUS_HOLD_MS) {
      const from = this.status;
      this.status = target;
      this.pending = null;
      return { from, to: target };
    }
    return null;
  }
}

/**
 * Trend from the last 10 temperature readings: least-squares slope per reading.
 * |slope| ≤ threshold → STABLE. Display only — never drives light, buzzer or door.
 */
export function heatTrend(lastReadings: number[], thresholdPerReading = 0.05): HeatTrend | null {
  const ys = lastReadings.filter(Number.isFinite).slice(-10);
  if (ys.length < 3) return null;
  const n = ys.length;
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  const slope = num / den;
  if (slope > thresholdPerReading) return "RISING";
  if (slope < -thresholdPerReading) return "FALLING";
  return "STABLE";
}

import { describe, expect, it } from "vitest";
import { DEFAULT_DEVICE_SETTINGS, deviceSettingsSchema, heatIndexC, heatTrend, isValidReading, StatusMachine, thermalTarget } from "@/lib/safety";

describe("heatIndexC (NOAA)", () => {
  it("matches NWS reference values", () => {
    expect(heatIndexC(32.2222, 50)).toBeCloseTo(35.0, 0); // 90 °F / 50 % → 95 °F
    expect(heatIndexC(37.7778, 40)).toBeCloseTo(42.8, 0); // 100 °F / 40 % → 109 °F
  });
  it("returns null for invalid input instead of inventing a value", () => {
    expect(heatIndexC(null, 50)).toBeNull();
    expect(heatIndexC(30, 120)).toBeNull();
  });
});

describe("Level 3 thresholds (defaults 32/40, leave 2 °C below, humidity 85/80)", () => {
  const s = DEFAULT_DEVICE_SETTINGS;
  it("enters WARNING at 32 °C or 85 % RH, DANGER at 40 °C", () => {
    expect(thermalTarget("SAFE", 31.9, 60, s)).toBe("SAFE");
    expect(thermalTarget("SAFE", 32, 60, s)).toBe("WARNING");
    expect(thermalTarget("SAFE", 25, 85, s)).toBe("WARNING");
    expect(thermalTarget("WARNING", 40, 60, s)).toBe("DANGER");
  });
  it("leaves DANGER at 38 °C and WARNING at 30 °C with RH ≤ 80 %", () => {
    expect(thermalTarget("DANGER", 38.1, 60, s)).toBe("DANGER");
    expect(thermalTarget("DANGER", 38, 60, s)).toBe("WARNING");
    expect(thermalTarget("WARNING", 30.1, 60, s)).toBe("WARNING");
    expect(thermalTarget("WARNING", 30, 81, s)).toBe("WARNING");
    expect(thermalTarget("WARNING", 30, 80, s)).toBe("SAFE");
  });
  it("hair-dryer run: exactly one DANGER→WARNING and one WARNING→SAFE, SAFE only at ≤ 30 °C", () => {
    const m = new StatusMachine(s);
    const changes: string[] = [];
    let t = 0;
    const temps = [28, 31, 33, 35, 37, 39, 40.5, 41, 41.5, 40, 39, 38.5, 39.2, 38, 37, 34, 32, 31, 30.5, 31.2, 30, 29, 28];
    for (const temp of temps) {
      for (let k = 0; k < 5; k++) { // each reading held 5 s, sampled every second
        const c = m.update(t, temp, 60);
        if (c) changes.push(`${c.from}->${c.to}@${temp}`);
        t += 1000;
      }
    }
    expect(changes).toEqual(["SAFE->WARNING@33", "WARNING->DANGER@40.5", "DANGER->WARNING@38", "WARNING->SAFE@30"]);
  });
  it("needs 3 s of hold and ignores bad readings (quality=bad keeps the last status)", () => {
    const m = new StatusMachine(s);
    expect(m.update(0, 33, 60)).toBeNull();
    expect(m.update(2000, 33, 60)).toBeNull();
    expect(m.update(3000, 33, 60)).toEqual({ from: "SAFE", to: "WARNING" });
    expect(m.update(4000, -5, 60)).toBeNull();
    expect(m.update(9000, null, null)).toBeNull();
    expect(m.status).toBe("WARNING");
    expect(isValidReading(51, 50)).toBe(false);
    expect(isValidReading(30, 95)).toBe(false);
  });
});

describe("heat trend from the last 10 readings", () => {
  it("rising / falling / stable", () => {
    expect(heatTrend([28, 28.2, 28.4, 28.6, 28.8, 29, 29.2, 29.4, 29.6, 29.8])).toBe("RISING");
    expect(heatTrend([29.8, 29.6, 29.4, 29.2, 29, 28.8])).toBe("FALLING");
    expect(heatTrend([28, 28.1, 28, 27.9, 28, 28.1, 28, 28])).toBe("STABLE");
    expect(heatTrend([28, 29])).toBeNull();
  });
});

describe("Level 5 settings validation", () => {
  it("accepts defaults and judge values between 25 and 35", () => {
    expect(deviceSettingsSchema.safeParse(DEFAULT_DEVICE_SETTINGS).success).toBe(true);
    expect(deviceSettingsSchema.safeParse({ temp_warning_c: 27, temp_danger_c: 40 }).success).toBe(true);
  });
  it("refuses a Warning limit of 45 °C with a clear message", () => {
    const r = deviceSettingsSchema.safeParse({ temp_warning_c: 45, temp_danger_c: 40 });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toBe("The Warning limit must be below the Danger limit");
  });
  it("refuses values outside 0–50 °C and unknown fields", () => {
    expect(deviceSettingsSchema.safeParse({ temp_warning_c: -1, temp_danger_c: 40 }).success).toBe(false);
    expect(deviceSettingsSchema.safeParse({ temp_warning_c: 30, temp_danger_c: 51 }).success).toBe(false);
    expect(deviceSettingsSchema.safeParse({ temp_warning_c: 30, temp_danger_c: 40, x: 1 }).success).toBe(false);
  });
});

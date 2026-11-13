/**
 * Browser smoke test of the Level 4 judge checks against a running server.
 * Credentials come from the environment (never hard-coded):
 *   BASE_URL, E2E_ADMIN, E2E_TEACHER, E2E_S1, E2E_S2, E2E_GUARDIAN  each "username:password"
 *   E2E_SHOTS=dir to save screenshots
 */
import { createRequire } from "node:module";
// Uses the machine's installed Playwright (require resolution), no project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const cred = (k) => {
  const [u, ...p] = (process.env[k] ?? "").split(":");
  if (!u) throw new Error(`${k} not set`);
  return { u, p: p.join(":") };
};
const shots = process.env.E2E_SHOTS;
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

async function login(browser, k, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: shots ? 2 : 1 });
  const page = await ctx.newPage();
  const { u, p } = cred(k);
  await page.goto(`${BASE}/login`);
  await page.fill("#username", u);
  await page.fill("#password", p);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => !url.pathname.startsWith("/login") && url.pathname !== "/", { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  return { ctx, page };
}

const browser = await chromium.launch();
try {
  // Teacher: live dashboard updates without reload
  const t = await login(browser, "E2E_TEACHER");
  await t.page.waitForSelector("text=Physics Lab", { timeout: 10000 });
  check("teacher lands on room overview", t.page.url().endsWith("/dashboard"));
  await t.page.click("text=Physics Lab");
  await t.page.waitForSelector("text=Device health", { timeout: 10000 });
  const firstUptime = await t.page.locator("dt:has-text('Uptime') + dd").innerText();
  await t.page.waitForTimeout(6500);
  const secondUptime = await t.page.locator("dt:has-text('Uptime') + dd").innerText();
  check("room dashboard updates by itself", firstUptime !== secondUptime, `${firstUptime} → ${secondUptime}`);
  check("simulated data is labelled", (await t.page.locator("text=SIMULATED DATA").count()) > 0);
  if (shots) await t.page.screenshot({ path: `${shots}/room-en.png`, fullPage: true });

  // Bangla switch on two pages, then back
  await t.page.click("button:has-text('বাংলা')");
  await t.page.waitForSelector("text=ডিভাইসের স্বাস্থ্য", { timeout: 10000 });
  check("room page in Bangla", true);
  if (shots) await t.page.screenshot({ path: `${shots}/room-bn.png`, fullPage: true });
  await t.page.goto(`${BASE}/alerts`);
  await t.page.waitForSelector("h1:has-text('সতর্কবার্তা')", { timeout: 10000 });
  check("alerts page in Bangla", true);
  await t.page.click("button:has-text('English')");
  await t.page.waitForSelector("h1:has-text('Alerts')", { timeout: 10000 });
  check("back to English", true);

  // Teacher cannot open Admin settings
  const r1 = await t.page.goto(`${BASE}/admin/settings`);
  check("teacher refused settings page (403)", r1.status() === 403, `HTTP ${r1.status()}`);
  const api1 = await t.page.request.get(`${BASE}/api/admin/login-history`);
  check("teacher refused admin API (403)", api1.status() === 403);

  // Student S2 opens S1's attendance page → 403, no data
  const a = await login(browser, "E2E_ADMIN");
  await a.page.goto(`${BASE}/admin/students`);
  const s1Row = a.page.locator("tr", { hasText: "Student One" });
  check("admin sees students", (await s1Row.count()) > 0);
  await a.page.goto(`${BASE}/admin/login-history`);
  check("admin login history lists attempts", (await a.page.locator("tbody tr").count()) > 0);
  if (shots) await a.page.screenshot({ path: `${shots}/login-history.png` });

  const s1 = await login(browser, "E2E_S1");
  check("student lands on own attendance", s1.page.url().endsWith("/me"));
  const s1Link = await s1.page.locator("a[href^='/students/']").first().getAttribute("href");
  const s2 = await login(browser, "E2E_S2");
  const r2 = await s2.page.goto(`${BASE}${s1Link}`);
  const body2 = await s2.page.locator("body").innerText();
  check("S2 refused S1's attendance page (403, no data)", r2.status() === 403 && !body2.includes("Student One"), `HTTP ${r2.status()}`);
  const api2 = await s2.page.request.get(`${BASE}/api${s1Link}/attendance`);
  check("S2 refused S1's attendance API (403)", api2.status() === 403);
  const r3 = await s2.page.goto(`${BASE}/dashboard`);
  check("student refused teacher dashboard (403)", r3.status() === 403);

  const g = await login(browser, "E2E_GUARDIAN", { width: 390, height: 844 });
  check("guardian lands on children page", g.page.url().endsWith("/guardian"));
  check("guardian sees linked child", (await g.page.locator("text=Student One").count()) > 0);
  check("guardian does not see other child", (await g.page.locator("text=Student Two").count()) === 0);
  if (shots) await g.page.screenshot({ path: `${shots}/guardian-mobile.png`, fullPage: true });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);

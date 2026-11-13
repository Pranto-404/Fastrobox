/**
 * Account and demo-data seeding. Passwords are never stored in the repository.
 *
 *   npm run seed -- --admin                 create the first Admin from BOOTSTRAP_ADMIN_USERNAME / _PASSWORD
 *   npm run seed -- --file accounts.local.json
 *        file: [{ "username": "...", "display_name": "...", "role": "teacher", "password": "...",
 *                 "rooms": ["R-305"], "student_code": "S1", "guardian_of": ["S1"] }]
 *        (*.local.json is git-ignored)
 *   APP_MODE=demo npm run seed -- --demo    demo classroom + SIMULATED device (prints its token once)
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { db, closeDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { registerDevice } from "../src/lib/devices";

interface Account {
  username: string; display_name: string; role: "admin" | "teacher" | "student" | "guardian"; password: string;
  rooms?: string[]; student_code?: string; guardian_of?: string[];
}

async function upsertUser(a: Account) {
  const sql = db();
  const hash = await hashPassword(a.password);
  const [u] = await sql<{ id: string }[]>`
    insert into users (username, display_name, role, password_hash) values (${a.username.toLowerCase()}, ${a.display_name}, ${a.role}, ${hash})
    on conflict (username) do update set display_name = excluded.display_name, role = excluded.role, password_hash = excluded.password_hash
    returning id`;
  for (const code of a.rooms ?? []) {
    const [c] = await sql<{ id: string }[]>`insert into classrooms (room_code, name) values (${code}, ${"Room " + code})
                                            on conflict (room_code) do update set room_code = excluded.room_code returning id`;
    await sql`insert into teacher_classrooms (teacher_id, classroom_id) values (${u.id}, ${c.id}) on conflict do nothing`;
  }
  if (a.role === "student" && a.student_code) {
    await sql`update students set user_id = ${u.id} where student_code = ${a.student_code}`;
  }
  for (const code of a.guardian_of ?? []) {
    const [s] = await sql<{ id: string }[]>`select id from students where student_code = ${code}`;
    if (s) await sql`insert into guardian_student_links (guardian_id, student_id) values (${u.id}, ${s.id}) on conflict do nothing`;
  }
  console.log(`user ${a.username} (${a.role}) ready`);
}

const pw = () => randomBytes(9).toString("base64url");

async function demo() {
  if (process.env.APP_MODE !== "demo") throw new Error("--demo requires APP_MODE=demo");
  const sql = db();
  const [room] = await sql<{ id: string }[]>`insert into classrooms (room_code, name, capacity) values ('R-305', 'Physics Lab (demo)', 30)
                                             on conflict (room_code) do update set name = excluded.name returning id`;
  for (const [code, name] of [["S1", "Student One"], ["S2", "Student Two"]]) {
    await sql`insert into students (student_code, full_name, classroom_id) values (${code}, ${name}, ${room.id}) on conflict (student_code) do nothing`;
  }
  const accounts: Account[] = [
    { username: "demo-admin", display_name: "Demo Admin", role: "admin", password: pw() },
    { username: "demo-teacher", display_name: "Demo Teacher", role: "teacher", password: pw(), rooms: ["R-305"] },
    { username: "demo-s1", display_name: "Student One", role: "student", password: pw(), student_code: "S1" },
    { username: "demo-s2", display_name: "Student Two", role: "student", password: pw(), student_code: "S2" },
    { username: "demo-guardian", display_name: "Guardian of S1", role: "guardian", password: pw(), guardian_of: ["S1"] },
  ];
  for (const a of accounts) await upsertUser(a);
  const dow = Number((await sql`select extract(dow from now() at time zone 'Asia/Dhaka')::int as d`)[0].d);
  await sql`insert into class_schedules (classroom_id, subject, day_of_week, start_time, end_time)
            select ${room.id}, 'Physics (demo)', ${dow}, '00:05', '23:55'
             where not exists (select 1 from class_schedules where classroom_id = ${room.id})`;
  const existing = await sql`select id from devices where device_uid = 'T07-SIM'`;
  console.log("\nDemo accounts (shown once — store them in your password manager):");
  for (const a of accounts) console.log(`  ${a.role.padEnd(8)} ${a.username.padEnd(14)} ${a.password}`);
  if (!existing.length) {
    const d = await registerDevice({ device_uid: "T07-SIM", name: "Simulated ESP32 (demo)", is_simulated: true }, null);
    console.log(`\nSimulated device T07-SIM token (shown once): ${d.token}`);
  } else console.log("\nDevice T07-SIM already exists (rotate its token on the Devices page if needed).");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--admin")) {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!username || !password || password.length < 8) throw new Error("Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD (≥ 8 chars)");
    await upsertUser({ username, display_name: "Administrator", role: "admin", password });
  }
  const fi = args.indexOf("--file");
  if (fi >= 0) {
    const list = JSON.parse(readFileSync(args[fi + 1], "utf8")) as Account[];
    for (const a of list) await upsertUser(a);
  }
  if (args.includes("--demo")) await demo();
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());

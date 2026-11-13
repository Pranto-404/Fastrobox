/**
 * Applies SQL migrations from ../supabase/migrations in filename order, once each.
 * Usage: DATABASE_URL=... npx tsx scripts/migrate.ts [--reset]
 * --reset drops and recreates the public schema (refused unless APP_MODE=demo or NODE_ENV=test).
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

export async function migrate(databaseUrl: string, opts: { reset?: boolean; quiet?: boolean } = {}) {
  const u = new URL(databaseUrl);
  u.searchParams.delete("channel_binding"); // libpq-only option
  const sql = postgres(u.toString(), { max: 1, onnotice: () => {} });
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  try {
    if (opts.reset) {
      await sql.unsafe("drop schema if exists public cascade; create schema public;");
    }
    await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      if (!opts.quiet) console.log(`applied ${file}`);
    }
    await sql.unsafe("select app_lockdown_rls()");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const reset = process.argv.includes("--reset");
  if (reset && process.env.APP_MODE !== "demo" && process.env.NODE_ENV !== "test") {
    console.error("--reset is only allowed with APP_MODE=demo or NODE_ENV=test");
    process.exit(1);
  }
  migrate(url, { reset })
    .then(() => console.log("migrations complete"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

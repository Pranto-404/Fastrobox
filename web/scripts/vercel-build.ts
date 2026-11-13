/**
 * Vercel build step (package.json "vercel-build"): applies pending migrations, then
 * creates the first Admin if none exists and BOOTSTRAP_ADMIN_USERNAME/PASSWORD are
 * set (remove those variables after the first successful deployment), then builds.
 * Uses the direct (unpooled) connection when the Neon integration provides one.
 */
import { execSync } from "node:child_process";
import postgres from "postgres";
import { hash } from "@node-rs/argon2";
import { migrate } from "./migrate";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — connect a Postgres database to this Vercel project");
  await migrate(url);
  console.log("migrations up to date");

  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (username && password) {
    const u = new URL(url);
    u.searchParams.delete("channel_binding");
    const sql = postgres(u.toString(), { max: 1, onnotice: () => {} });
    try {
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from users where role = 'admin'`;
      if (n === 0) {
        if (password.length < 8) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters");
        const h = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
        await sql`insert into users (username, display_name, role, password_hash) values (${username}, 'Administrator', 'admin', ${h})`;
        console.log(`created first admin '${username}' — now remove BOOTSTRAP_ADMIN_* from the Vercel environment`);
      } else {
        console.log("an admin already exists — BOOTSTRAP_ADMIN_* ignored (remove them from the environment)");
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  execSync("next build", { stdio: "inherit" });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

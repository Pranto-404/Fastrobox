import postgres from "postgres";
import { config } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = postgres.Sql<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = postgres.Sql<any> | postgres.TransactionSql<any>;

const globalForDb = globalThis as unknown as { __frxSql?: Sql };

/**
 * Shared Postgres client (server-side only). `prepare: false` keeps it compatible
 * with the Supabase transaction-mode connection pooler.
 */
export function db(): Sql {
  if (!globalForDb.__frxSql) {
    globalForDb.__frxSql = postgres(config().DATABASE_URL, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      types: {
        // Return bigint ids as JS numbers (all our identity columns stay < 2^53).
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
      onnotice: () => {},
    });
  }
  return globalForDb.__frxSql;
}

export async function closeDb() {
  if (globalForDb.__frxSql) {
    await globalForDb.__frxSql.end({ timeout: 5 });
    globalForDb.__frxSql = undefined;
  }
}

/** numeric columns come back as strings; convert safely. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

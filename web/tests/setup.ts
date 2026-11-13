import { afterAll } from "vitest";
import { closeDb } from "@/lib/db";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/fastrobox_test";
process.env.APP_MODE = process.env.APP_MODE ?? "demo";
// NODE_ENV is read-only in some typings; assign through an index signature.
(process.env as Record<string, string>).NODE_ENV = "test";

afterAll(async () => {
  await closeDb();
});

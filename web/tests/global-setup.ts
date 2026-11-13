import { migrate } from "../scripts/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/fastrobox_test";
  process.env.DATABASE_URL = url;
  await migrate(url, { reset: true, quiet: true });
}

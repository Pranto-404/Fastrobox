import { hash, verify } from "@node-rs/argon2";

// argon2id (Algorithm.Argon2id = 2) with OWASP-recommended parameters.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}

// Used to equalise timing when the username does not exist.
let dummyHash: Promise<string> | null = null;
export function dummyVerify(plain: string) {
  dummyHash ??= hashPassword("frx-dummy-password-for-timing");
  return dummyHash.then((h) => verifyPassword(h, plain));
}

export const PASSWORD_RULES = { min: 8, max: 128 };

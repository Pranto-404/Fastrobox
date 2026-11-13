import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Structured API error: { error: { code, message, details? } }. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status });
}

export function toErrorResponse(e: unknown) {
  if (e instanceof ApiError) return jsonError(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) {
    return jsonError(
      422,
      "validation_failed",
      "Request body failed validation",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  console.error("[api] unhandled error", e);
  return jsonError(500, "internal_error", "Internal server error");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler so every thrown error becomes a structured JSON response. */
export function route<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

/** Reads and parses a JSON body with a hard size limit. */
export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError(413, "payload_too_large", `Body exceeds ${maxBytes} bytes`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Body is not valid JSON");
  }
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

/** Rejects cross-site browser requests to state-changing endpoints (CSRF defence in depth). */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients / same-origin navigations without Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return;
  } catch {
    /* fallthrough */
  }
  throw new ApiError(403, "cross_origin_rejected", "Cross-origin request rejected");
}

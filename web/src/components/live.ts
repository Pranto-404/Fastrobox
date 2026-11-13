"use client";
import useSWR from "swr";

export class FetchError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new FetchError(res.status, body);
  return body as T;
}

/** Live data: refreshes every 1.5 s so dashboards update within the 3 s limit without reloading. */
export function useLive<T>(url: string | null, intervalMs = 1500) {
  return useSWR<T>(url, (u: string) => fetchJson<T>(u), { refreshInterval: intervalMs, revalidateOnFocus: true, dedupingInterval: 500 });
}

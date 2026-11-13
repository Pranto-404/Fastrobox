"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders a server page periodically (used for pages whose state changes on device acks). */
export function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}

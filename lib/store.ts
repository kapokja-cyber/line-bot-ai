/**
 * Key-value store สำหรับจำว่า user คนไหน "ส่งต่อเจ้าหน้าที่แล้ว" (bot เงียบชั่วคราว)
 *
 * ใช้ Upstash Redis (REST) ถ้ามี env:
 *   - KV_REST_API_URL + KV_REST_API_TOKEN       (ตั้งให้อัตโนมัติเมื่อเชื่อม Upstash ผ่าน Vercel Marketplace)
 *   - หรือ UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * ถ้าไม่มี → fallback เป็น memory (ใช้ได้แต่ไม่แน่นอนบน Vercel เพราะ instance ถูก recycle)
 */
import { log } from "@/lib/log";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const memory = new Map<string, number>(); // key → expiresAt (ms)
let warnedFallback = false;

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

function useRedis(): boolean {
  if (REDIS_URL && REDIS_TOKEN) return true;
  if (!warnedFallback) {
    log.warn("store.memory_fallback", { hint: "connect Upstash Redis for reliable handoff pause" });
    warnedFallback = true;
  }
  return false;
}

export async function setFlag(key: string, ttlSeconds: number): Promise<void> {
  if (useRedis()) {
    try {
      await redis(["SET", key, "1", "EX", ttlSeconds]);
      return;
    } catch (err) {
      log.error("store.set_failed", { err: (err as Error).message });
    }
  }
  memory.set(key, Date.now() + ttlSeconds * 1000);
}

export async function hasFlag(key: string): Promise<boolean> {
  if (useRedis()) {
    try {
      return (await redis(["GET", key])) !== null;
    } catch (err) {
      log.error("store.get_failed", { err: (err as Error).message });
    }
  }
  const exp = memory.get(key);
  if (!exp) return false;
  if (exp < Date.now()) {
    memory.delete(key);
    return false;
  }
  return true;
}

export async function clearFlag(key: string): Promise<void> {
  if (useRedis()) {
    try {
      await redis(["DEL", key]);
    } catch (err) {
      log.error("store.del_failed", { err: (err as Error).message });
    }
  }
  memory.delete(key);
}

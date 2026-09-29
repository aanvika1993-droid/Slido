import { UserError } from "./errors";

// In-memory fixed-window counters. Fine for a single server process; use Redis when running several.
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { rateBuckets?: Map<string, Bucket>; rateSweepAt?: number };
const buckets = (g.rateBuckets ??= new Map());

function bucket(key: string, windowMs: number, now: number): Bucket {
  if (now - (g.rateSweepAt ?? 0) > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    g.rateSweepAt = now;
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  return b;
}

/** Records one attempt; returns false once `limit` attempts have been made in the window. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = bucket(key, windowMs, now);
  b.count++;
  return b.count <= limit;
}

/** True when `limit` attempts have already been recorded, without recording a new one. */
export function isLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return bucket(key, windowMs, now).count >= limit;
}

export const TOO_FAST = "You're doing that too fast. Please wait a moment and try again.";

export function enforce(key: string, limit: number, windowMs: number) {
  if (!hit(key, limit, windowMs)) throw new UserError(TOO_FAST);
}

export function resetRateLimits() {
  buckets.clear();
}

import "server-only"

import { getRedis, REDIS_TIMEOUT_MS } from "@/lib/redis"

// After a failure, skip Redis for a while so every request during an outage
// doesn't wait out the timeout again before falling back to the YouTube API.
export const CACHE_COOLDOWN_MS = 30_000

let disabledUntil = 0
let warnedMissingEnv = false
let warnedUnavailable = false

function cacheClient() {
  let redis: ReturnType<typeof getRedis>
  try {
    redis = getRedis()
  } catch (error) {
    markUnavailable(error)
    return null
  }

  if (!redis) {
    if (!warnedMissingEnv) {
      warnedMissingEnv = true
      console.warn(
        "[cache] KV_REST_API_URL / KV_REST_API_TOKEN not set; caching is disabled and every request calls the YouTube API."
      )
    }
    return null
  }

  return Date.now() < disabledUntil ? null : redis
}

function markUnavailable(error: unknown) {
  disabledUntil = Date.now() + CACHE_COOLDOWN_MS

  if (!warnedUnavailable) {
    warnedUnavailable = true
    console.warn(
      `[cache] Redis unavailable; falling back to the YouTube API and retrying in ${CACHE_COOLDOWN_MS / 1000}s.`,
      error
    )
  }
}

function markAvailable() {
  if (warnedUnavailable) {
    warnedUnavailable = false
    console.info("[cache] Redis reachable again.")
  }
}

function withTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis call timed out after ${REDIS_TIMEOUT_MS}ms`)),
      REDIS_TIMEOUT_MS
    )
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function runCacheCall<T>(call: () => Promise<T>) {
  try {
    const result = await withTimeout(call())
    markAvailable()
    return { ok: true as const, result }
  } catch (error) {
    markUnavailable(error)
    return { ok: false as const }
  }
}

/** Returns the cached value, or null on a miss or any cache failure. */
export async function readCache<T>(key: string) {
  const redis = cacheClient()
  if (!redis) {
    return null
  }

  const response = await runCacheCall(() => redis.get<T>(key))
  return response.ok ? (response.result ?? null) : null
}

/** Best effort: failures are logged once and otherwise ignored. */
export async function writeCache<T>(key: string, value: T, ttlSeconds: number) {
  const redis = cacheClient()
  if (!redis) {
    return
  }

  await runCacheCall(() => redis.set(key, value, { ex: ttlSeconds }))
}

export function resetCacheStateForTests() {
  disabledUntil = 0
  warnedMissingEnv = false
  warnedUnavailable = false
}

import "server-only"

import { Ratelimit } from "@upstash/ratelimit"

import { getRedis } from "@/lib/redis"

// Per IP, across the page's GET search/live path and the server actions. A
// cache miss costs YouTube quota (a live check is a 100-unit search.list), so
// this bounds what one client can spend. Cached reads stay free.
export const RATE_LIMIT_REQUESTS = 40
export const RATE_LIMIT_WINDOW = "60 s"
export const RATE_LIMITED_MESSAGE =
  "Too many requests. Showing saved results only; try again in a minute."

let limiter: Ratelimit | null | undefined

function getLimiter() {
  if (limiter !== undefined) {
    return limiter
  }

  const redis = getRedis()
  limiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW),
        prefix: "view:ratelimit:v1",
      })
    : null

  return limiter
}

export function clientIp(requestHeaders: Headers) {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown"
}

/**
 * True when this client is over its limit. Without Upstash (local, CI) or when
 * the limiter itself fails, nothing is limited: the limiter must never take
 * the app down.
 */
export async function isRateLimited(requestHeaders: Headers) {
  let instance: Ratelimit | null
  try {
    instance = getLimiter()
  } catch {
    return false
  }

  if (!instance) {
    return false
  }

  try {
    const { success } = await instance.limit(clientIp(requestHeaders))
    return !success
  } catch (error) {
    console.warn("[rate-limit] Limiter unavailable; allowing the request.", error)
    return false
  }
}

export function resetRateLimiterForTests() {
  limiter = undefined
}

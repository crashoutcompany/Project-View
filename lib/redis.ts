import "server-only";

import { Redis } from "@upstash/redis";

import { getRequiredEnv, hasRedisEnv } from "@/lib/env";

// Redis is only a cache in front of the YouTube API, so a slow or dead
// database should cost one short request, not the default retry/backoff chain.
export const REDIS_TIMEOUT_MS = 1000;

let redisClient: Redis | null | undefined;

export function getRedis() {
  if (redisClient !== undefined) {
    return redisClient;
  }

  if (!hasRedisEnv()) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({
    url: getRequiredEnv("KV_REST_API_URL"),
    token: getRequiredEnv("KV_REST_API_TOKEN"),
    retry: false,
    // Must be a function: a fresh signal per request, and the client only
    // throws on abort for function signals (a static signal resolves the
    // abort reason as if it were the cached value).
    signal: () => AbortSignal.timeout(REDIS_TIMEOUT_MS),
  });

  return redisClient;
}

import "server-only"

import { Redis } from "@upstash/redis"

import { getRequiredEnv, hasRedisEnv } from "@/lib/env"

let redisClient: Redis | null | undefined

export function getRedis() {
  if (redisClient !== undefined) {
    return redisClient
  }

  if (!hasRedisEnv()) {
    redisClient = null
    return redisClient
  }

  redisClient = new Redis({
    url: getRequiredEnv("UPSTASH_REDIS_REST_URL"),
    token: getRequiredEnv("UPSTASH_REDIS_REST_TOKEN"),
  })

  return redisClient
}

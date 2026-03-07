import "server-only";

import { Redis } from "@upstash/redis";

import { getRequiredEnv, hasRedisEnv } from "@/lib/env";

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
  });

  return redisClient;
}

/**
 * @jest-environment node
 */

import { afterEach, describe, expect, it } from "@jest/globals"

import { getRequiredEnv, hasRedisEnv, hasYouTubeEnv } from "@/lib/env"

const originalEnv = process.env

describe("env helpers", () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns true when both Redis variables are present", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com"
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret"

    expect(hasRedisEnv()).toBe(true)
  })

  it("returns false when either Redis variable is missing", () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret"

    expect(hasRedisEnv()).toBe(false)
  })

  it("treats empty YouTube API keys as missing", () => {
    process.env.YOUTUBE_API_KEY = ""

    expect(hasYouTubeEnv()).toBe(false)
  })

  it("returns the required environment value", () => {
    process.env.YOUTUBE_API_KEY = "abc123"

    expect(getRequiredEnv("YOUTUBE_API_KEY")).toBe("abc123")
  })

  it("throws when a required environment variable is missing", () => {
    delete process.env.YOUTUBE_API_KEY

    expect(() => getRequiredEnv("YOUTUBE_API_KEY")).toThrow(
      "Missing required environment variable: YOUTUBE_API_KEY"
    )
  })
})

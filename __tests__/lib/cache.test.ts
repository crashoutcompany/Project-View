/**
 * @jest-environment node
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"

type RedisMock = {
  get: ReturnType<typeof jest.fn<(key: string) => Promise<unknown>>>
  set: ReturnType<
    typeof jest.fn<(key: string, value: unknown, options: { ex: number }) => Promise<unknown>>
  >
}

const TIMEOUT_MS = 1000
const mockGetRedis = jest.fn<() => RedisMock | null>()

jest.unstable_mockModule("@/lib/redis", () => ({
  getRedis: mockGetRedis,
  REDIS_TIMEOUT_MS: TIMEOUT_MS,
}))

let cache: typeof import("@/lib/cache")

beforeAll(async () => {
  cache = await import("@/lib/cache")
})

function createRedisMock(): RedisMock {
  return {
    get: jest.fn<(key: string) => Promise<unknown>>(),
    set: jest
      .fn<(key: string, value: unknown, options: { ex: number }) => Promise<unknown>>()
      .mockResolvedValue("OK"),
  }
}

const connectionError = new TypeError("fetch failed", {
  cause: new Error("getaddrinfo ENOTFOUND definite-glider-65020.upstash.io"),
})

describe("cache", () => {
  let warn: ReturnType<typeof jest.spyOn>
  let info: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    cache.resetCacheStateForTests()
    mockGetRedis.mockReset()
    warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    info = jest.spyOn(console, "info").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it("reads and writes through Redis when it is healthy", async () => {
    const redis = createRedisMock()
    redis.get.mockResolvedValue({ hit: true })
    mockGetRedis.mockReturnValue(redis)

    await expect(cache.readCache("key")).resolves.toEqual({ hit: true })
    await cache.writeCache("key", { hit: true }, 60)

    expect(redis.set).toHaveBeenCalledWith("key", { hit: true }, { ex: 60 })
    expect(warn).not.toHaveBeenCalled()
  })

  it("treats missing env as a cache miss and warns once", async () => {
    mockGetRedis.mockReturnValue(null)

    await expect(cache.readCache("a")).resolves.toBeNull()
    await expect(cache.writeCache("a", 1, 60)).resolves.toBeUndefined()
    await expect(cache.readCache("b")).resolves.toBeNull()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain("KV_REST_API_URL")
  })

  it("falls back on connection errors, warns once, and stops calling Redis during the cooldown", async () => {
    const redis = createRedisMock()
    redis.get.mockRejectedValue(connectionError)
    redis.set.mockRejectedValue(connectionError)
    mockGetRedis.mockReturnValue(redis)

    await expect(cache.readCache("a")).resolves.toBeNull()
    await expect(cache.writeCache("a", 1, 60)).resolves.toBeUndefined()
    await expect(cache.readCache("b")).resolves.toBeNull()

    expect(redis.get).toHaveBeenCalledTimes(1)
    expect(redis.set).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][1]).toBe(connectionError)
  })

  it("swallows write errors", async () => {
    const redis = createRedisMock()
    redis.set.mockRejectedValue(new Error("WRONGPASS invalid token"))
    mockGetRedis.mockReturnValue(redis)

    await expect(cache.writeCache("a", 1, 60)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it("times out a hung Redis call instead of stalling the caller", async () => {
    jest.useFakeTimers()
    const redis = createRedisMock()
    redis.get.mockReturnValue(new Promise(() => {}))
    mockGetRedis.mockReturnValue(redis)

    const read = cache.readCache("slow")
    await jest.advanceTimersByTimeAsync(TIMEOUT_MS)

    await expect(read).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][1])).toContain("timed out")
  })

  it("retries Redis after the cooldown and logs the recovery", async () => {
    jest.useFakeTimers()
    const redis = createRedisMock()
    redis.get.mockRejectedValueOnce(connectionError).mockResolvedValue("fresh")
    mockGetRedis.mockReturnValue(redis)

    await expect(cache.readCache("a")).resolves.toBeNull()
    jest.advanceTimersByTime(cache.CACHE_COOLDOWN_MS)
    await expect(cache.readCache("a")).resolves.toBe("fresh")

    expect(redis.get).toHaveBeenCalledTimes(2)
    expect(info).toHaveBeenCalledTimes(1)
  })

  it("falls back when building the client throws", async () => {
    mockGetRedis.mockImplementation(() => {
      throw new Error("bad url")
    })

    await expect(cache.readCache("a")).resolves.toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

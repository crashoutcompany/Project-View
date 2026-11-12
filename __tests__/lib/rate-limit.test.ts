/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGetRedis = vi.fn()
const mockLimit = vi.fn()

vi.doMock("@/lib/redis", () => ({ getRedis: mockGetRedis }))
vi.doMock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => "window")
    limit = mockLimit
  }
  return { Ratelimit }
})

let isRateLimited: typeof import("@/lib/rate-limit").isRateLimited
let clientIp: typeof import("@/lib/rate-limit").clientIp
let resetRateLimiterForTests: typeof import("@/lib/rate-limit").resetRateLimiterForTests

beforeEach(async () => {
  ;({ isRateLimited, clientIp, resetRateLimiterForTests } = await import("@/lib/rate-limit"))
  resetRateLimiterForTests()
  mockGetRedis.mockReset()
  mockLimit.mockReset()
})

const requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })

describe("clientIp", () => {
  it("uses the first x-forwarded-for hop, then x-real-ip", () => {
    expect(clientIp(requestHeaders)).toBe("203.0.113.9")
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2")
    expect(clientIp(new Headers())).toBe("unknown")
  })
})

describe("isRateLimited", () => {
  it("does not limit when Upstash is not configured", async () => {
    mockGetRedis.mockReturnValue(null)

    await expect(isRateLimited(requestHeaders)).resolves.toBe(false)
    expect(mockLimit).not.toHaveBeenCalled()
  })

  it("limits by IP when the limiter rejects", async () => {
    mockGetRedis.mockReturnValue({})
    mockLimit.mockResolvedValue({ success: false })

    await expect(isRateLimited(requestHeaders)).resolves.toBe(true)
    expect(mockLimit).toHaveBeenCalledWith("203.0.113.9")
  })

  it("allows requests under the limit", async () => {
    mockGetRedis.mockReturnValue({})
    mockLimit.mockResolvedValue({ success: true })

    await expect(isRateLimited(requestHeaders)).resolves.toBe(false)
  })

  it("fails open when the limiter errors", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mockGetRedis.mockReturnValue({})
    mockLimit.mockRejectedValue(new Error("redis down"))

    await expect(isRateLimited(requestHeaders)).resolves.toBe(false)
  })
})

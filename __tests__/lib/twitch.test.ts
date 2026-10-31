/**
 * @vitest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

// Fetch, env and cache are stubbed: no real Twitch calls.
const mockReadCache = vi.fn<(key: string) => Promise<unknown>>()
const mockWriteCache = vi.fn<(key: string, value: unknown, ttl: number) => Promise<void>>()
const mockHasTwitchEnv = vi.fn<() => boolean>()

vi.doMock("@/lib/cache", () => ({ readCache: mockReadCache, writeCache: mockWriteCache }))
vi.doMock("@/lib/env", () => ({
  getRequiredEnv: (name: string) => `test-${name.toLowerCase()}`,
  hasTwitchEnv: mockHasTwitchEnv,
}))

let twitch: typeof import("@/lib/twitch")

beforeAll(async () => {
  twitch = await import("@/lib/twitch")
})

function json(payload: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload } as Response
}

const TOKEN = { access_token: "app-token", expires_in: 5_000_000, token_type: "bearer" }

describe("twitch client", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    twitch.resetTwitchTokenForTests()
    fetchMock.mockReset()
    global.fetch = fetchMock
    mockReadCache.mockReset().mockResolvedValue(null)
    mockWriteCache.mockReset().mockResolvedValue(undefined)
    mockHasTwitchEnv.mockReturnValue(true)
  })

  function urlOf(call: number) {
    return new URL(String(fetchMock.mock.calls[call]?.[0]))
  }

  it("reports whether Twitch is configured", () => {
    mockHasTwitchEnv.mockReturnValueOnce(false)
    expect(twitch.twitchConfigured()).toBe(false)
  })

  it("gets a client-credentials app token and caches it a bit short of expires_in", async () => {
    fetchMock.mockResolvedValueOnce(json(TOKEN)).mockResolvedValueOnce(json({ data: [] }))

    await twitch.getStreamsByUserIds(["1"])

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!
    expect(tokenUrl).toBe("https://id.twitch.tv/oauth2/token")
    expect(String(tokenInit?.body)).toContain("grant_type=client_credentials")
    expect(String(tokenInit?.body)).toContain("client_id=test-twitch_client_id")
    expect(mockWriteCache).toHaveBeenCalledWith(
      "tw:token:v1",
      expect.objectContaining({ accessToken: "app-token" }),
      TOKEN.expires_in - 3600
    )
    const helixHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(helixHeaders).toMatchObject({
      "Client-Id": "test-twitch_client_id",
      Authorization: "Bearer app-token",
    })
  })

  it("reuses the token in memory, and from Redis on a cold instance", async () => {
    mockReadCache.mockResolvedValueOnce({ accessToken: "redis-token", expiresAt: Date.now() + 60_000 })
    fetchMock.mockResolvedValue(json({ data: [] }))

    await twitch.getStreamsByUserIds(["1"])
    await twitch.getStreamsByUserIds(["2"])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("https://api.twitch.tv/helix/"))).toBe(true)
    expect(mockReadCache).toHaveBeenCalledTimes(1)
  })

  it("refreshes the token once on a 401 and retries", async () => {
    mockReadCache.mockResolvedValueOnce({ accessToken: "stale", expiresAt: Date.now() + 60_000 })
    fetchMock
      .mockResolvedValueOnce(json({ message: "Invalid OAuth token" }, 401))
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json({ data: [] }))

    await expect(twitch.getStreamsByUserIds(["1"])).resolves.toBeInstanceOf(Map)
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://id.twitch.tv/oauth2/token")
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe("Bearer app-token")
  })

  it("gives up after a second 401", async () => {
    fetchMock
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(json({}, 401))

    await expect(twitch.getStreamsByUserIds(["1"])).rejects.toThrow("401")
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("throws when the token request fails, so callers can fail soft", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "invalid client" }, 400))

    await expect(twitch.searchChannels("crash")).rejects.toThrow("Twitch token request failed with 400")
  })

  it("checks many users in one /streams call and maps live details", async () => {
    fetchMock.mockResolvedValueOnce(json(TOKEN)).mockResolvedValueOnce(
      json({
        data: [
          {
            user_id: "1",
            type: "live",
            title: "  Speedrun  ",
            started_at: "2026-10-29T20:00:00Z",
            thumbnail_url: "https://static-cdn.jtvnw.net/previews-ttv/live_user_a-{width}x{height}.jpg",
          },
        ],
      })
    )

    const statuses = await twitch.getStreamsByUserIds(["1", "2"])

    expect(urlOf(1).pathname).toBe("/helix/streams")
    expect(urlOf(1).searchParams.getAll("user_id")).toEqual(["1", "2"])
    expect(statuses.get("1")).toMatchObject({
      status: "live",
      title: "Speedrun",
      startedAt: "2026-10-29T20:00:00Z",
      thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_a-640x360.jpg",
    })
    expect(statuses.get("1")).not.toHaveProperty("viewerCount")
    expect(statuses.get("1")?.videoId).toBeUndefined()
    expect(statuses.get("2")).toMatchObject({ status: "offline" })
  })

  it("caps a /streams call at 100 ids and skips the call for none", async () => {
    await expect(twitch.getStreamsByUserIds([])).resolves.toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(json(TOKEN)).mockResolvedValueOnce(json({ data: [] }))
    await twitch.getStreamsByUserIds(Array.from({ length: 150 }, (_, i) => String(i)))
    expect(urlOf(1).searchParams.getAll("user_id")).toHaveLength(twitch.HELIX_MAX_IDS)
  })

  it("searches channels and fills descriptions from one /users call", async () => {
    fetchMock
      .mockResolvedValueOnce(json(TOKEN))
      .mockResolvedValueOnce(
        json({
          data: [
            { id: "1", broadcaster_login: "crash", display_name: "Crash", thumbnail_url: "s1.png" },
            { id: "2", broadcaster_login: "", display_name: "Broken" },
            { id: "3", broadcaster_login: "other", display_name: "Other", thumbnail_url: "s3.png" },
          ],
        })
      )
      .mockResolvedValueOnce(
        json({
          data: [
            {
              id: "1",
              login: "crash",
              display_name: "Crash",
              description: " Variety streams ",
              profile_image_url: "p1.png",
            },
          ],
        })
      )

    const channels = await twitch.searchChannels("crash", 5)

    expect(urlOf(1).pathname).toBe("/helix/search/channels")
    expect(urlOf(1).searchParams.get("query")).toBe("crash")
    expect(urlOf(1).searchParams.get("first")).toBe("5")
    expect(urlOf(2).searchParams.getAll("id")).toEqual(["1", "3"])
    expect(channels).toEqual([
      {
        platform: "twitch",
        channelId: "tw:1",
        login: "crash",
        title: "Crash",
        description: "Variety streams",
        thumbnailUrl: "p1.png",
      },
      {
        platform: "twitch",
        channelId: "tw:3",
        login: "other",
        title: "Other",
        description: "",
        thumbnailUrl: "s3.png",
      },
    ])
  })
})

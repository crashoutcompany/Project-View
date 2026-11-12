/**
 * @vitest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { BaseChannel, LiveStatus } from "@/lib/types"

import {
  CHANNEL_CACHE_TTL_SECONDS,
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  SEARCH_CACHE_TTL_SECONDS,
  SEARCH_RESULT_LIMIT,
  channelCacheKey,
  liveCacheKey,
  searchCacheKey,
} from "@/lib/cache-keys"

const mockGetRedis = vi.fn<() => RedisMock | null>()
const mockGetChannelsByIds = vi.fn<(channelIds: string[]) => Promise<BaseChannel[]>>()
const mockGetLiveVideoForChannel = vi.fn<(channelId: string) => Promise<LiveStatus>>()
const mockSearchChannels = vi.fn<
  (query: string, maxResults?: number) => Promise<BaseChannel[]>
>()
const mockYoutubeConfigured = vi.fn<() => boolean>()

vi.doMock("@/lib/redis", () => ({
  getRedis: mockGetRedis,
  REDIS_TIMEOUT_MS: 1000,
}))

// Twitch is covered in search-service-twitch.test.ts; keep it off here.
vi.doMock("@/lib/twitch", () => ({
  getStreamsByUserIds: vi.fn(),
  getUsersByIds: vi.fn(),
  HELIX_MAX_IDS: 100,
  searchChannels: vi.fn(),
  twitchConfigured: () => false,
}))

vi.doMock("@/lib/youtube", () => ({
  getChannelsByIds: mockGetChannelsByIds,
  getLiveVideoForChannel: mockGetLiveVideoForChannel,
  searchChannels: mockSearchChannels,
  youtubeConfigured: mockYoutubeConfigured,
}))

let getSearchResults: typeof import("@/lib/search-service").getSearchResults
let getSelectedChannels: typeof import("@/lib/search-service").getSelectedChannels
let projectConfigured: typeof import("@/lib/search-service").projectConfigured
let refreshChannelLiveStatus: typeof import("@/lib/search-service").refreshChannelLiveStatus
let resetCacheStateForTests: typeof import("@/lib/cache").resetCacheStateForTests
let resetYouTubeStateForTests: typeof import("@/lib/search-service").resetYouTubeStateForTests

beforeAll(async () => {
  ;({
    getSearchResults,
    getSelectedChannels,
    projectConfigured,
    refreshChannelLiveStatus,
    resetYouTubeStateForTests,
  } = await import("@/lib/search-service"))
  ;({ resetCacheStateForTests } = await import("@/lib/cache"))
})

type RedisMock = {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<unknown>>>
  set: ReturnType<
    typeof vi.fn<
      (key: string, value: unknown, options: { ex: number }) => Promise<void>
    >
  >
}

function createRedisMock(): RedisMock {
  return {
    get: vi.fn<(key: string) => Promise<unknown>>(),
    set: vi
      .fn<(key: string, value: unknown, options: { ex: number }) => Promise<void>>()
      .mockResolvedValue(undefined),
  }
}

describe("search service", () => {
  beforeEach(() => {
    resetCacheStateForTests()
    resetYouTubeStateForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    mockYoutubeConfigured.mockReturnValue(true)
    mockSearchChannels.mockReset()
    mockGetChannelsByIds.mockReset()
    mockGetLiveVideoForChannel.mockReset()
    mockGetRedis.mockReset()
  })

  it("makes no YouTube calls beyond one live check per channel on a page load", async () => {
    mockGetRedis.mockReturnValue(null)
    mockGetChannelsByIds.mockImplementation(async (channelIds: string[]) =>
      channelIds.map((channelId) => ({
        platform: "youtube",
        channelId,
        title: channelId,
        description: "",
        thumbnailUrl: "",
      }))
    )
    mockGetLiveVideoForChannel.mockImplementation(async (channelId: string) =>
      channelId === "UCchan-1xxxxxxxxxxxxxxxx"
        ? {
            status: "live",
            checkedAt: "now",
            videoId: "video-1",
            startedAt: "2026-03-05T23:00:00.000Z",
          }
        : { status: "offline", checkedAt: "now" }
    )

    // Mirrors the page: search and selected channels in one load.
    const [, selected] = await Promise.all([
      getSearchResults(""),
      getSelectedChannels(["UCchan-1xxxxxxxxxxxxxxxx", "UCchan-2xxxxxxxxxxxxxxxx"]),
    ])

    expect(mockSearchChannels).not.toHaveBeenCalled()
    expect(mockGetChannelsByIds).toHaveBeenCalledTimes(2)
    expect(mockGetLiveVideoForChannel).toHaveBeenCalledTimes(2)
    expect(selected[0]?.live).toMatchObject({
      status: "live",
      startedAt: "2026-03-05T23:00:00.000Z",
    })
  })

  it("serves cached live state, including uptime, without calling YouTube", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    redis.get.mockImplementation(async (key: string) => {
      if (key === channelCacheKey("UCchan-1xxxxxxxxxxxxxxxx")) {
        return { platform: "youtube", channelId: "UCchan-1xxxxxxxxxxxxxxxx", title: "One", description: "", thumbnailUrl: "" }
      }
      if (key === liveCacheKey("UCchan-1xxxxxxxxxxxxxxxx")) {
        return { status: "live", checkedAt: "x", videoId: "v", startedAt: "cached-start" }
      }
      return null
    })

    const selected = await getSelectedChannels(["UCchan-1xxxxxxxxxxxxxxxx"])

    expect(selected[0]?.live.startedAt).toBe("cached-start")
    expect(mockGetChannelsByIds).not.toHaveBeenCalled()
    expect(mockGetLiveVideoForChannel).not.toHaveBeenCalled()
  })

  it("reports whether the project is configured", () => {
    mockYoutubeConfigured.mockReturnValueOnce(false)

    expect(projectConfigured()).toBe(false)
  })

  it("stays configured without Redis, since the cache is optional", () => {
    mockGetRedis.mockReturnValue(null)

    expect(projectConfigured()).toBe(true)
  })

  it("returns no channels for an empty query", async () => {
    await expect(getSearchResults("  ")).resolves.toEqual({
      query: "",
      channels: [],
      cached: false,
      source: "search",
    })
    expect(mockSearchChannels).not.toHaveBeenCalled()
  })

  it("searches, caches, and merges live state on cache misses", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    mockSearchChannels.mockResolvedValue(
      Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({
        platform: "youtube",
        channelId: `UCchan-${index + 1}`.padEnd(24, "x"),
        title: `Channel ${index + 1}`,
        description: `Description ${index + 1}`,
        thumbnailUrl: `thumb-${index + 1}.jpg`,
      }))
    )

    mockGetLiveVideoForChannel.mockImplementation(async (channelId: string) => ({
      status: channelId === "UCchan-1xxxxxxxxxxxxxxxx" ? "live" : "offline",
      checkedAt: `${channelId}-checked`,
      ...(channelId === "UCchan-1xxxxxxxxxxxxxxxx" ? { videoId: "video-1" } : {}),
    }))

    const payload = await getSearchResults("  @Crash   Out  ")

    expect(payload.query).toBe("crash out")
    expect(payload.cached).toBe(false)
    expect(payload.source).toBe("search")
    expect(payload.channels).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(payload.channels[0]?.live.status).toBe("live")
    expect(mockSearchChannels).toHaveBeenCalledWith("crash out", SEARCH_RESULT_LIMIT)

    expect(redis.set).toHaveBeenCalledWith(
      searchCacheKey("crash out"),
      expect.any(Array),
      { ex: SEARCH_CACHE_TTL_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      channelCacheKey("UCchan-1xxxxxxxxxxxxxxxx"),
      expect.objectContaining({ channelId: "UCchan-1xxxxxxxxxxxxxxxx" }),
      { ex: CHANNEL_CACHE_TTL_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      liveCacheKey("UCchan-1xxxxxxxxxxxxxxxx"),
      expect.objectContaining({ status: "live", videoId: "video-1" }),
      { ex: LIVE_CACHE_TTL_LIVE_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      liveCacheKey("UCchan-2xxxxxxxxxxxxxxxx"),
      expect.objectContaining({ status: "offline" }),
      { ex: LIVE_CACHE_TTL_OFFLINE_SECONDS }
    )
  })

  it("uses cached search results when available", async () => {
    const redis = createRedisMock()
    const cachedChannels = [
      {
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Cached",
        description: "Cached description",
        thumbnailUrl: "cached.jpg",
      },
    ]

    mockGetRedis.mockReturnValue(redis)
    redis.get.mockImplementation(async (key: string) => {
      if (key === searchCacheKey("cached")) {
        return cachedChannels
      }

      if (key === liveCacheKey("UCchan-1xxxxxxxxxxxxxxxx")) {
        return {
          status: "offline",
          checkedAt: "cached-live",
        }
      }

      return null
    })

    await expect(getSearchResults("cached")).resolves.toEqual({
      query: "cached",
      channels: [
        {
          ...cachedChannels[0],
          live: {
            status: "offline",
            checkedAt: "cached-live",
          },
        },
      ],
      cached: true,
      source: "search",
    })

    expect(mockSearchChannels).not.toHaveBeenCalled()
  })

  it("still returns search results when Redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null)
    mockSearchChannels.mockResolvedValue([
      {
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Channel One",
        description: "Desc",
        thumbnailUrl: "thumb.jpg",
      },
    ])
    mockGetLiveVideoForChannel.mockResolvedValue({
      status: "offline",
      checkedAt: "2026-03-06T00:00:00.000Z",
    })

    await expect(getSearchResults("channel")).resolves.toEqual({
      query: "channel",
      channels: [
        {
          platform: "youtube",
          channelId: "UCchan-1xxxxxxxxxxxxxxxx",
          title: "Channel One",
          description: "Desc",
          thumbnailUrl: "thumb.jpg",
          live: {
            status: "offline",
            checkedAt: "2026-03-06T00:00:00.000Z",
          },
        },
      ],
      cached: false,
      source: "search",
    })
  })

  it("deduplicates selected channels and filters missing lookups", async () => {
    mockGetRedis.mockReturnValue(null)
    mockGetChannelsByIds.mockImplementation(async ([channelId]: string[]) => {
      if (channelId === "UCmissingxxxxxxxxxxxxxxx") {
        return []
      }

      return [
        {
          platform: "youtube",
          channelId,
          title: `Title ${channelId}`,
          description: "",
          thumbnailUrl: `${channelId}.jpg`,
        },
      ]
    })
    mockGetLiveVideoForChannel.mockImplementation(async (channelId: string) => ({
      status: "offline",
      checkedAt: `${channelId}-checked`,
    }))

    await expect(
      getSelectedChannels(["UCchan-1xxxxxxxxxxxxxxxx", "UCchan-1xxxxxxxxxxxxxxxx", "", "UCmissingxxxxxxxxxxxxxxx", "UCchan-2xxxxxxxxxxxxxxxx"])
    ).resolves.toEqual([
      {
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Title UCchan-1xxxxxxxxxxxxxxxx",
        description: "",
        thumbnailUrl: "UCchan-1xxxxxxxxxxxxxxxx.jpg",
        live: {
          status: "offline",
          checkedAt: "UCchan-1xxxxxxxxxxxxxxxx-checked",
        },
      },
      {
        platform: "youtube",
        channelId: "UCchan-2xxxxxxxxxxxxxxxx",
        title: "Title UCchan-2xxxxxxxxxxxxxxxx",
        description: "",
        thumbnailUrl: "UCchan-2xxxxxxxxxxxxxxxx.jpg",
        live: {
          status: "offline",
          checkedAt: "UCchan-2xxxxxxxxxxxxxxxx-checked",
        },
      },
    ])

    expect(mockGetChannelsByIds).toHaveBeenCalledTimes(3)
  })

  it("refreshes a single channel and caches the new live state", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    mockGetChannelsByIds.mockResolvedValue([
      {
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Channel One",
        description: "",
        thumbnailUrl: "chan-1.jpg",
      },
    ])
    mockGetLiveVideoForChannel.mockResolvedValue({
      status: "live",
      checkedAt: "2026-03-06T00:00:00.000Z",
      videoId: "video-1",
    })

    const payload = await refreshChannelLiveStatus("UCchan-1xxxxxxxxxxxxxxxx")

    expect(payload).toEqual({
      platform: "youtube",
      channelId: "UCchan-1xxxxxxxxxxxxxxxx",
      title: "Channel One",
      description: "",
      thumbnailUrl: "chan-1.jpg",
      live: {
        status: "live",
        checkedAt: "2026-03-06T00:00:00.000Z",
        videoId: "video-1",
      },
    })
    expect(redis.set).toHaveBeenCalledWith(
      liveCacheKey("UCchan-1xxxxxxxxxxxxxxxx"),
      expect.objectContaining({ status: "live", videoId: "video-1" }),
      { ex: LIVE_CACHE_TTL_LIVE_SECONDS }
    )
  })

  it("does not call YouTube when refreshing a channel with a cached live status", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    const id = "UCchan-1xxxxxxxxxxxxxxxx"
    redis.get.mockImplementation(async (key: string) => {
      if (key === channelCacheKey(id)) {
        return { platform: "youtube", channelId: id, title: "One", description: "", thumbnailUrl: "" }
      }
      if (key === liveCacheKey(id)) {
        return { status: "live", checkedAt: "cached", videoId: "v" }
      }
      return null
    })

    const payload = await refreshChannelLiveStatus(id)

    expect(payload?.live).toMatchObject({ status: "live", checkedAt: "cached" })
    expect(mockGetLiveVideoForChannel).not.toHaveBeenCalled()
  })

  it("never calls YouTube in cached-only mode", async () => {
    mockGetRedis.mockReturnValue(createRedisMock())
    const id = "UCchan-1xxxxxxxxxxxxxxxx"

    const refreshed = await refreshChannelLiveStatus(id, true)
    const selected = await getSelectedChannels([id], true)
    const search = await getSearchResults("anything", "all", true)

    expect(refreshed?.live.status).toBe("unknown")
    expect(selected[0]?.live.status).toBe("unknown")
    expect(search.channels).toEqual([])
    expect(mockGetChannelsByIds).not.toHaveBeenCalled()
    expect(mockSearchChannels).not.toHaveBeenCalled()
    expect(mockGetLiveVideoForChannel).not.toHaveBeenCalled()
  })

  it("returns null when a refreshed channel cannot be found", async () => {
    mockGetRedis.mockReturnValue(null)
    mockGetChannelsByIds.mockResolvedValue([])

    await expect(refreshChannelLiveStatus("missing")).resolves.toBeNull()
  })

  it("serves search results from YouTube when every Redis call fails", async () => {
    const redis = createRedisMock()
    const outage = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND example.upstash.io"),
    })
    redis.get.mockRejectedValue(outage)
    redis.set.mockRejectedValue(outage)
    mockGetRedis.mockReturnValue(redis)
    mockSearchChannels.mockResolvedValue([
      { platform: "youtube", channelId: "UCchan-1xxxxxxxxxxxxxxxx", title: "Channel One", description: "", thumbnailUrl: "" },
    ])
    mockGetLiveVideoForChannel.mockResolvedValue({
      status: "offline",
      checkedAt: "2026-03-06T00:00:00.000Z",
    })

    await expect(getSearchResults("channel")).resolves.toMatchObject({
      query: "channel",
      cached: false,
      channels: [{ channelId: "UCchan-1xxxxxxxxxxxxxxxx", live: { status: "offline" } }],
    })
    mockGetChannelsByIds.mockResolvedValue([
      { platform: "youtube", channelId: "UCchan-2xxxxxxxxxxxxxxxx", title: "Channel Two", description: "", thumbnailUrl: "" },
    ])
    await expect(getSelectedChannels(["UCchan-2xxxxxxxxxxxxxxxx"])).resolves.toMatchObject([
      { channelId: "UCchan-2xxxxxxxxxxxxxxxx", live: { status: "offline" } },
    ])
    expect(mockSearchChannels).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  describe("when the YouTube API fails", () => {
    const quotaError = new Error("Request failed with 403 (quotaExceeded)")

    it("returns empty search results and caches nothing", async () => {
      const redis = createRedisMock()
      redis.get.mockResolvedValue(null)
      mockGetRedis.mockReturnValue(redis)
      mockSearchChannels.mockRejectedValue(quotaError)

      await expect(getSearchResults("channel")).resolves.toEqual({
        query: "channel",
        channels: [],
        cached: false,
        source: "search",
      })
      expect(redis.set).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalledTimes(1)
    })

    it("keeps selected channels with an unknown live state and does not cache it", async () => {
      const redis = createRedisMock()
      redis.get.mockImplementation(async (key: string) =>
        key === channelCacheKey("UCchan-1xxxxxxxxxxxxxxxx")
          ? { platform: "youtube", channelId: "UCchan-1xxxxxxxxxxxxxxxx", title: "Cached", description: "", thumbnailUrl: "c.jpg" }
          : null
      )
      mockGetRedis.mockReturnValue(redis)
      mockGetChannelsByIds.mockRejectedValue(quotaError)
      mockGetLiveVideoForChannel.mockRejectedValue(quotaError)

      await expect(getSelectedChannels(["UCchan-1xxxxxxxxxxxxxxxx", "UCchan-2xxxxxxxxxxxxxxxx"])).resolves.toEqual([
        {
          platform: "youtube",
          channelId: "UCchan-1xxxxxxxxxxxxxxxx",
          title: "Cached",
          description: "",
          thumbnailUrl: "c.jpg",
          live: { status: "unknown", checkedAt: expect.any(String) },
        },
        {
          platform: "youtube",
          channelId: "UCchan-2xxxxxxxxxxxxxxxx",
          title: "UCchan-2xxxxxxxxxxxxxxxx",
          description: "",
          thumbnailUrl: "",
          live: { status: "unknown", checkedAt: expect.any(String) },
        },
      ])
      expect(redis.set).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalledTimes(1)
    })

    it("refreshes to an unknown live state instead of dropping the channel", async () => {
      mockGetRedis.mockReturnValue(null)
      mockGetChannelsByIds.mockRejectedValue(quotaError)
      mockGetLiveVideoForChannel.mockRejectedValue(quotaError)

      await expect(refreshChannelLiveStatus("UCchan-1xxxxxxxxxxxxxxxx")).resolves.toMatchObject({
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        live: { status: "unknown" },
      })
    })

    it("logs recovery once YouTube answers again", async () => {
      mockGetRedis.mockReturnValue(null)
      mockSearchChannels.mockRejectedValueOnce(quotaError).mockResolvedValueOnce([])

      await getSearchResults("one")
      await getSearchResults("two")

      expect(console.warn).toHaveBeenCalledTimes(2) // missing-env cache warning + YouTube
      expect(console.info).toHaveBeenCalledWith("[youtube] YouTube API reachable again.")
    })
  })
})

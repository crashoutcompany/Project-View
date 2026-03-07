/**
 * @jest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"
import type { BaseChannel, LiveStatus } from "@/lib/types"

import {
  CHANNEL_CACHE_TTL_SECONDS,
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  SEARCH_CACHE_TTL_SECONDS,
  SEARCH_RESULT_LIMIT,
  SEED_CACHE_TTL_SECONDS,
  channelCacheKey,
  liveCacheKey,
  searchCacheKey,
  seedCacheKey,
} from "@/lib/cache-keys"

const mockHasRedisEnv = jest.fn<() => boolean>()
const mockGetRedis = jest.fn<() => RedisMock | null>()
const mockGetChannelsByIds = jest.fn<(channelIds: string[]) => Promise<BaseChannel[]>>()
const mockGetLiveVideoForChannel = jest.fn<(channelId: string) => Promise<LiveStatus>>()
const mockSearchChannels = jest.fn<
  (query: string, maxResults?: number) => Promise<BaseChannel[]>
>()
const mockYoutubeConfigured = jest.fn<() => boolean>()

jest.unstable_mockModule("@/lib/env", () => ({
  hasRedisEnv: mockHasRedisEnv,
}))

jest.unstable_mockModule("@/lib/redis", () => ({
  getRedis: mockGetRedis,
}))

jest.unstable_mockModule("@/lib/youtube", () => ({
  getChannelsByIds: mockGetChannelsByIds,
  getLiveVideoForChannel: mockGetLiveVideoForChannel,
  searchChannels: mockSearchChannels,
  youtubeConfigured: mockYoutubeConfigured,
}))

let getSearchResults: typeof import("@/lib/search-service").getSearchResults
let getSeedResults: typeof import("@/lib/search-service").getSeedResults
let getSelectedChannels: typeof import("@/lib/search-service").getSelectedChannels
let projectConfigured: typeof import("@/lib/search-service").projectConfigured
let refreshChannelLiveStatus: typeof import("@/lib/search-service").refreshChannelLiveStatus

beforeAll(async () => {
  ;({
    getSearchResults,
    getSeedResults,
    getSelectedChannels,
    projectConfigured,
    refreshChannelLiveStatus,
  } = await import("@/lib/search-service"))
})

type RedisMock = {
  get: ReturnType<typeof jest.fn<(key: string) => Promise<unknown>>>
  set: ReturnType<
    typeof jest.fn<
      (key: string, value: unknown, options: { ex: number }) => Promise<void>
    >
  >
}

function createRedisMock(): RedisMock {
  return {
    get: jest.fn<(key: string) => Promise<unknown>>(),
    set: jest
      .fn<(key: string, value: unknown, options: { ex: number }) => Promise<void>>()
      .mockResolvedValue(undefined),
  }
}

describe("search service", () => {
  beforeEach(() => {
    mockHasRedisEnv.mockReturnValue(true)
    mockYoutubeConfigured.mockReturnValue(true)
    mockSearchChannels.mockReset()
    mockGetChannelsByIds.mockReset()
    mockGetLiveVideoForChannel.mockReset()
    mockGetRedis.mockReset()
  })

  it("reports whether the project is configured", () => {
    mockYoutubeConfigured.mockReturnValueOnce(false)

    expect(projectConfigured()).toBe(false)
  })

  it("returns an empty seed payload when the project is not configured", async () => {
    mockYoutubeConfigured.mockReturnValueOnce(false)

    await expect(getSeedResults()).resolves.toEqual({
      query: "",
      channels: [],
      cached: false,
      source: "seed",
    })
  })

  it("returns cached seed channels with live state", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    redis.get.mockImplementation(async (key: string) => {
      if (key === seedCacheKey) {
        return [
          {
            channelId: "chan-1",
            title: "Seeded",
            description: "Ready",
            thumbnailUrl: "seed.jpg",
          },
        ]
      }

      if (key === liveCacheKey("chan-1")) {
        return {
          status: "live",
          checkedAt: "2026-03-06T00:00:00.000Z",
          videoId: "video-1",
        }
      }

      return null
    })

    await expect(getSeedResults()).resolves.toEqual({
      query: "",
      channels: [
        {
          channelId: "chan-1",
          title: "Seeded",
          description: "Ready",
          thumbnailUrl: "seed.jpg",
          live: {
            status: "live",
            checkedAt: "2026-03-06T00:00:00.000Z",
            videoId: "video-1",
          },
        },
      ],
      cached: true,
      source: "seed",
    })

    expect(mockGetLiveVideoForChannel).not.toHaveBeenCalled()
  })

  it("searches, caches, and merges live state on cache misses", async () => {
    const redis = createRedisMock()
    mockGetRedis.mockReturnValue(redis)
    redis.get.mockImplementation(async (key: string) => {
      if (key === seedCacheKey) {
        return [
          {
            channelId: "seed-existing",
            title: "Existing Seed",
            description: "Existing",
            thumbnailUrl: "seed-existing.jpg",
          },
        ]
      }

      return null
    })

    mockSearchChannels.mockResolvedValue(
      Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({
        channelId: `chan-${index + 1}`,
        title: `Channel ${index + 1}`,
        description: `Description ${index + 1}`,
        thumbnailUrl: `thumb-${index + 1}.jpg`,
      }))
    )

    mockGetLiveVideoForChannel.mockImplementation(async (channelId: string) => ({
      status: channelId === "chan-1" ? "live" : "offline",
      checkedAt: `${channelId}-checked`,
      ...(channelId === "chan-1" ? { videoId: "video-1" } : {}),
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
      channelCacheKey("chan-1"),
      expect.objectContaining({ channelId: "chan-1" }),
      { ex: CHANNEL_CACHE_TTL_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      liveCacheKey("chan-1"),
      expect.objectContaining({ status: "live", videoId: "video-1" }),
      { ex: LIVE_CACHE_TTL_LIVE_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      liveCacheKey("chan-2"),
      expect.objectContaining({ status: "offline" }),
      { ex: LIVE_CACHE_TTL_OFFLINE_SECONDS }
    )
    expect(redis.set).toHaveBeenCalledWith(
      seedCacheKey,
      expect.arrayContaining([
        expect.objectContaining({ channelId: "chan-1" }),
        expect.objectContaining({ channelId: "seed-existing" }),
      ]),
      { ex: SEED_CACHE_TTL_SECONDS }
    )
  })

  it("uses cached search results when available", async () => {
    const redis = createRedisMock()
    const cachedChannels = [
      {
        channelId: "chan-1",
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

      if (key === seedCacheKey) {
        return []
      }

      if (key === liveCacheKey("chan-1")) {
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
    expect(redis.set).toHaveBeenCalledWith(
      seedCacheKey,
      expect.any(Array),
      { ex: SEED_CACHE_TTL_SECONDS }
    )
  })

  it("still returns search results when Redis is unavailable", async () => {
    mockGetRedis.mockReturnValue(null)
    mockSearchChannels.mockResolvedValue([
      {
        channelId: "chan-1",
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
          channelId: "chan-1",
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
      if (channelId === "missing") {
        return []
      }

      return [
        {
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
      getSelectedChannels(["chan-1", "chan-1", "", "missing", "chan-2"])
    ).resolves.toEqual([
      {
        channelId: "chan-1",
        title: "Title chan-1",
        description: "",
        thumbnailUrl: "chan-1.jpg",
        live: {
          status: "offline",
          checkedAt: "chan-1-checked",
        },
      },
      {
        channelId: "chan-2",
        title: "Title chan-2",
        description: "",
        thumbnailUrl: "chan-2.jpg",
        live: {
          status: "offline",
          checkedAt: "chan-2-checked",
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
        channelId: "chan-1",
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

    const payload = await refreshChannelLiveStatus("chan-1")

    expect(payload).toEqual({
      channelId: "chan-1",
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
      liveCacheKey("chan-1"),
      expect.objectContaining({ status: "live", videoId: "video-1" }),
      { ex: LIVE_CACHE_TTL_LIVE_SECONDS }
    )
  })

  it("returns null when a refreshed channel cannot be found", async () => {
    mockGetRedis.mockReturnValue(null)
    mockGetChannelsByIds.mockResolvedValue([])

    await expect(refreshChannelLiveStatus("missing")).resolves.toBeNull()
  })
})

/**
 * @vitest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { BaseChannel, LiveStatus } from "@/lib/types"

import {
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  MAX_SELECTED_CHANNELS,
  SEARCH_RESULT_LIMIT,
  liveCacheKey,
} from "@/lib/cache-keys"

// Twitch and YouTube are both stubbed: no real network calls.
const mockGetRedis = vi.fn<() => RedisMock | null>()
const mockYoutubeConfigured = vi.fn<() => boolean>()
const mockYoutubeGetChannelsByIds = vi.fn<(ids: string[]) => Promise<BaseChannel[]>>()
const mockYoutubeLive = vi.fn<(id: string) => Promise<LiveStatus>>()
const mockYoutubeSearch = vi.fn<(query: string, max?: number) => Promise<BaseChannel[]>>()
const mockTwitchConfigured = vi.fn<() => boolean>()
const mockGetUsersByIds = vi.fn<(ids: string[]) => Promise<Map<string, BaseChannel>>>()
const mockGetStreamsByUserIds = vi.fn<(ids: string[]) => Promise<Map<string, LiveStatus>>>()
const mockTwitchSearch = vi.fn<(query: string, max?: number) => Promise<BaseChannel[]>>()

vi.doMock("@/lib/redis", () => ({ getRedis: mockGetRedis, REDIS_TIMEOUT_MS: 1000 }))

vi.doMock("@/lib/youtube", () => ({
  getChannelsByIds: mockYoutubeGetChannelsByIds,
  getLiveVideoForChannel: mockYoutubeLive,
  searchChannels: mockYoutubeSearch,
  youtubeConfigured: mockYoutubeConfigured,
}))

vi.doMock("@/lib/twitch", () => ({
  getStreamsByUserIds: mockGetStreamsByUserIds,
  getUsersByIds: mockGetUsersByIds,
  HELIX_MAX_IDS: 100,
  searchChannels: mockTwitchSearch,
  twitchConfigured: mockTwitchConfigured,
}))

type RedisMock = {
  get: ReturnType<typeof vi.fn<(key: string) => Promise<unknown>>>
  set: ReturnType<typeof vi.fn<(key: string, value: unknown, options: { ex: number }) => Promise<void>>>
}

let service: typeof import("@/lib/search-service")
let resetCacheStateForTests: typeof import("@/lib/cache").resetCacheStateForTests

beforeAll(async () => {
  service = await import("@/lib/search-service")
  ;({ resetCacheStateForTests } = await import("@/lib/cache"))
})

function youtubeChannel(channelId: string): BaseChannel {
  return { platform: "youtube", channelId, title: channelId, description: "", thumbnailUrl: "" }
}

function twitchChannel(userId: string): BaseChannel {
  return {
    platform: "twitch",
    channelId: `tw:${userId}`,
    login: `user${userId}`,
    title: `User ${userId}`,
    description: "",
    thumbnailUrl: "",
  }
}

function usersFor(ids: string[]) {
  return new Map(ids.map((id) => [id, twitchChannel(id)]))
}

function streamsFor(ids: string[], liveIds: string[] = []) {
  return new Map<string, LiveStatus>(
    ids.map((id) => [
      id,
      liveIds.includes(id)
        ? {
            status: "live",
            checkedAt: "now",
            title: "Stream",
            startedAt: "2026-10-29T20:00:00.000Z",
          }
        : { status: "offline", checkedAt: "now" },
    ])
  )
}

describe("search service with Twitch", () => {
  beforeEach(() => {
    resetCacheStateForTests()
    service.resetYouTubeStateForTests()
    service.resetTwitchStateForTests()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    mockGetRedis.mockReset().mockReturnValue(null)
    mockYoutubeConfigured.mockReset().mockReturnValue(true)
    mockTwitchConfigured.mockReset().mockReturnValue(true)
    mockYoutubeGetChannelsByIds
      .mockReset()
      .mockImplementation(async (ids) => ids.map(youtubeChannel))
    mockYoutubeLive.mockReset().mockResolvedValue({ status: "offline", checkedAt: "now" })
    mockYoutubeSearch.mockReset()
    mockTwitchSearch.mockReset()
    mockGetUsersByIds.mockReset().mockImplementation(async (ids) => usersFor(ids))
    mockGetStreamsByUserIds.mockReset().mockImplementation(async (ids) => streamsFor(ids, ["1"]))
  })

  it("is configured with only Twitch credentials", () => {
    mockYoutubeConfigured.mockReturnValue(false)

    expect(service.projectConfigured()).toBe(true)
    expect(service.configuredPlatforms()).toEqual(["twitch"])
  })

  it("batches every Twitch lookup on a page load into one /users and one /streams call", async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") }
    mockGetRedis.mockReturnValue(redis)

    const selected = await service.getSelectedChannels(["tw:1", "UC-yt", "tw:2", "yt:UC-yt", "tw:3"])

    expect(mockGetUsersByIds).toHaveBeenCalledTimes(1)
    expect(mockGetUsersByIds).toHaveBeenCalledWith(["1", "2", "3"])
    expect(mockGetStreamsByUserIds).toHaveBeenCalledTimes(1)
    expect(mockGetStreamsByUserIds).toHaveBeenCalledWith(["1", "2", "3"])
    expect(selected.map((channel) => channel.channelId)).toEqual(["tw:1", "UC-yt", "tw:2", "tw:3"])
    expect(selected[0]).toMatchObject({
      platform: "twitch",
      login: "user1",
      live: { status: "live", startedAt: "2026-10-29T20:00:00.000Z" },
    })

    // Same live/offline TTLs as YouTube.
    expect(redis.set).toHaveBeenCalledWith(liveCacheKey("tw:1"), expect.anything(), {
      ex: LIVE_CACHE_TTL_LIVE_SECONDS,
    })
    expect(redis.set).toHaveBeenCalledWith(liveCacheKey("tw:2"), expect.anything(), {
      ex: LIVE_CACHE_TTL_OFFLINE_SECONDS,
    })
  })

  it("shares one /streams call across the seed, search and selected lists", async () => {
    const redis = {
      get: vi.fn(async (key: string) =>
        key === "yt:seed:v1" ? [twitchChannel("1"), twitchChannel("9")] : null
      ),
      set: vi.fn().mockResolvedValue("OK"),
    }
    mockGetRedis.mockReturnValue(redis)

    await Promise.all([
      service.getSeedResults(),
      service.getSearchResults(""),
      service.getSelectedChannels(["tw:1", "tw:2"]),
    ])

    expect(mockGetStreamsByUserIds).toHaveBeenCalledTimes(1)
    expect(new Set(mockGetStreamsByUserIds.mock.calls[0]?.[0])).toEqual(new Set(["1", "9", "2"]))
  })

  it("serves cached Twitch live state without calling Helix", async () => {
    const redis = {
      get: vi.fn(async (key: string) => {
        if (key === "tw:channel:v1:1") return twitchChannel("1")
        if (key === "tw:live:v1:1") return { status: "live", checkedAt: "x", startedAt: "cached-start" }
        return null
      }),
      set: vi.fn().mockResolvedValue("OK"),
    }
    mockGetRedis.mockReturnValue(redis)

    const [channel] = await service.getSelectedChannels(["tw:1"])

    expect(channel?.live.startedAt).toBe("cached-start")
    expect(mockGetUsersByIds).not.toHaveBeenCalled()
    expect(mockGetStreamsByUserIds).not.toHaveBeenCalled()
  })

  it("keeps YouTube working and logs one warning while Helix is down", async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") }
    mockGetRedis.mockReturnValue(redis)
    mockGetUsersByIds.mockRejectedValue(new Error("Twitch request failed with 503"))
    mockGetStreamsByUserIds.mockRejectedValue(new Error("Twitch request failed with 503"))
    mockYoutubeLive.mockResolvedValue({ status: "live", checkedAt: "now", videoId: "v1" })

    const first = await service.getSelectedChannels(["tw:1", "UC-yt"])
    await service.getSelectedChannels(["tw:2"])

    expect(first).toEqual([
      expect.objectContaining({ channelId: "tw:1", title: "tw:1", live: expect.objectContaining({ status: "unknown" }) }),
      expect.objectContaining({ channelId: "UC-yt", live: expect.objectContaining({ status: "live" }) }),
    ])
    const twitchWarnings = vi
      .mocked(console.warn)
      .mock.calls.filter(([message]) => String(message).startsWith("[twitch]"))
    expect(twitchWarnings).toHaveLength(1)
    // Fallbacks are never cached.
    const twitchWrites = redis.set.mock.calls.filter(([key]) => String(key).startsWith("tw:"))
    expect(twitchWrites).toEqual([])
  })

  it("keeps tw: ids as placeholders when Twitch isn't configured", async () => {
    mockTwitchConfigured.mockReturnValue(false)

    const selected = await service.getSelectedChannels(["tw:1", "UC-yt"])

    expect(selected.map((channel) => [channel.channelId, channel.platform, channel.live.status])).toEqual([
      ["tw:1", "twitch", "unknown"],
      ["UC-yt", "youtube", "offline"],
    ])
    expect(mockGetUsersByIds).not.toHaveBeenCalled()
    expect(mockGetStreamsByUserIds).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("[twitch]"),
      expect.anything()
    )
  })

  it("mixes both platforms in search under one shared result limit", async () => {
    mockYoutubeSearch.mockResolvedValue(["a", "b", "c", "d", "e"].map((id) => youtubeChannel(`UC${id}`)))
    mockTwitchSearch.mockResolvedValue(["1", "2", "3", "4", "5"].map(twitchChannel))

    const payload = await service.getSearchResults("crash")

    expect(payload.channels).toHaveLength(SEARCH_RESULT_LIMIT)
    expect(payload.channels.map((channel) => channel.channelId)).toEqual([
      "UCa",
      "tw:1",
      "UCb",
      "tw:2",
      "UCc",
    ])
    expect(mockGetStreamsByUserIds).toHaveBeenCalledTimes(1)
    expect(mockGetStreamsByUserIds).toHaveBeenCalledWith(["1", "2"])
  })

  it("searches a single platform when filtered", async () => {
    mockTwitchSearch.mockResolvedValue([twitchChannel("1")])

    const payload = await service.getSearchResults("crash", "twitch")

    expect(mockYoutubeSearch).not.toHaveBeenCalled()
    expect(payload.channels.map((channel) => channel.channelId)).toEqual(["tw:1"])
  })

  it("still returns YouTube matches when Twitch search fails", async () => {
    mockYoutubeSearch.mockResolvedValue([youtubeChannel("UCa")])
    mockTwitchSearch.mockRejectedValue(new Error("Twitch request failed with 500"))

    const payload = await service.getSearchResults("crash")

    expect(payload.channels.map((channel) => channel.channelId)).toEqual(["UCa"])
  })

  it("applies the selected-channel cap across both platforms combined", async () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS }, (_, index) =>
      index % 2 === 0 ? `tw:${index}` : `UC${index}`
    )

    const selected = await service.getSelectedChannels([...ids, "tw:999", "UCextra"])

    expect(selected).toHaveLength(MAX_SELECTED_CHANNELS)
    expect(mockGetStreamsByUserIds.mock.calls[0]?.[0]).toHaveLength(MAX_SELECTED_CHANNELS / 2)
  })

  it("refreshes many Twitch channels with one /streams call", async () => {
    await Promise.all(["tw:1", "tw:2", "tw:3"].map((id) => service.refreshChannelLiveStatus(id)))

    expect(mockGetStreamsByUserIds).toHaveBeenCalledTimes(1)
  })
})

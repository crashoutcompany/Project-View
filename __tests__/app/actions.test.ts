/**
 * @vitest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_SELECTED_CHANNELS } from "@/lib/cache-keys"
import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockCheckBotId = vi.fn<() => Promise<{ isBot: boolean }>>()
const mockGetSearchResults = vi.fn<(query: string) => Promise<SearchPayload>>()
const mockProjectConfigured = vi.fn<() => boolean>()
const mockRefreshChannelLiveStatus = vi.fn<
  (channelId: string) => Promise<ChannelResult | null>
>()

const mockIsRateLimited = vi.fn<(headers: Headers) => Promise<boolean>>()

vi.doMock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}))

vi.doMock("@/lib/rate-limit", () => ({
  isRateLimited: mockIsRateLimited,
  RATE_LIMITED_MESSAGE: "limited",
}))

vi.doMock("botid/server", () => ({
  checkBotId: mockCheckBotId,
}))

vi.doMock("@/lib/search-service", () => ({
  getSearchResults: mockGetSearchResults,
  projectConfigured: mockProjectConfigured,
  refreshChannelLiveStatus: mockRefreshChannelLiveStatus,
}))

let refreshSelectedChannelsAction: typeof import("@/app/actions").refreshSelectedChannelsAction
let searchChannelsAction: typeof import("@/app/actions").searchChannelsAction

beforeAll(async () => {
  ;({ refreshSelectedChannelsAction, searchChannelsAction } = await import("@/app/actions"))
})

describe("server actions", () => {
  beforeEach(() => {
    mockCheckBotId.mockResolvedValue({ isBot: false })
    mockProjectConfigured.mockReturnValue(true)
    mockIsRateLimited.mockResolvedValue(false)
    mockGetSearchResults.mockReset()
    mockRefreshChannelLiveStatus.mockReset()
  })

  it("rejects search requests from bots", async () => {
    mockCheckBotId.mockResolvedValueOnce({ isBot: true })

    await expect(searchChannelsAction("abc")).rejects.toThrow("Access denied")
    expect(mockGetSearchResults).not.toHaveBeenCalled()
  })

  it("returns an empty search payload when the project is not configured", async () => {
    mockProjectConfigured.mockReturnValueOnce(false)

    await expect(searchChannelsAction("abc")).resolves.toEqual({
      query: "abc",
      channels: [],
      cached: false,
      source: "search",
    })
  })

  it("delegates configured searches to the search service", async () => {
    const payload = {
      query: "abc",
      channels: [],
      cached: true,
      source: "search" as const,
    }
    mockGetSearchResults.mockResolvedValueOnce(payload)

    await expect(searchChannelsAction("abc")).resolves.toEqual(payload)
    expect(mockGetSearchResults).toHaveBeenCalledWith("abc", "all")
  })

  it("passes a platform filter through and rejects unknown platforms", async () => {
    mockGetSearchResults.mockResolvedValueOnce({
      query: "abc",
      channels: [],
      cached: false,
      source: "search",
    })

    await searchChannelsAction("abc", "twitch")
    expect(mockGetSearchResults).toHaveBeenCalledWith("abc", "twitch")

    await expect(
      searchChannelsAction("abc", "kick" as unknown as "twitch")
    ).rejects.toThrow("Invalid platform")
  })

  it("canonicalizes yt: ids and accepts tw: ids on refresh", async () => {
    mockRefreshChannelLiveStatus.mockResolvedValue(null)

    await refreshSelectedChannelsAction(["yt:UC123xxxxxxxxxxxxxxxxxxx", "UC123xxxxxxxxxxxxxxxxxxx", "tw:12345"])

    expect(mockRefreshChannelLiveStatus.mock.calls.map(([id]) => id)).toEqual([
      "UC123xxxxxxxxxxxxxxxxxxx",
      "tw:12345",
    ])
    await expect(refreshSelectedChannelsAction(["tw:not-a-number"])).rejects.toThrow(
      "Invalid channel ids"
    )
  })

  it("returns an empty array on refresh when the project is not configured", async () => {
    mockProjectConfigured.mockReturnValueOnce(false)

    await expect(refreshSelectedChannelsAction(["a"])).resolves.toEqual([])
    expect(mockRefreshChannelLiveStatus).not.toHaveBeenCalled()
  })

  it("deduplicates ids, drops blanks, and filters null refreshes", async () => {
    mockRefreshChannelLiveStatus
      .mockResolvedValueOnce({
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Channel One",
        description: "",
        thumbnailUrl: "",
        live: { status: "offline", checkedAt: "2026-03-06T00:00:00.000Z" },
      })
      .mockResolvedValueOnce(null)

    await expect(
      refreshSelectedChannelsAction(["UCchan-1xxxxxxxxxxxxxxxx", "", "UCchan-1xxxxxxxxxxxxxxxx", "UCchan-2xxxxxxxxxxxxxxxx"])
    ).resolves.toEqual([
      {
        platform: "youtube",
        channelId: "UCchan-1xxxxxxxxxxxxxxxx",
        title: "Channel One",
        description: "",
        thumbnailUrl: "",
        live: { status: "offline", checkedAt: "2026-03-06T00:00:00.000Z" },
      },
    ])

    expect(mockRefreshChannelLiveStatus).toHaveBeenCalledTimes(2)
    expect(mockRefreshChannelLiveStatus).toHaveBeenNthCalledWith(1, "UCchan-1xxxxxxxxxxxxxxxx", false)
    expect(mockRefreshChannelLiveStatus).toHaveBeenNthCalledWith(2, "UCchan-2xxxxxxxxxxxxxxxx", false)
  })

  it("rejects refresh requests from bots", async () => {
    mockCheckBotId.mockResolvedValueOnce({ isBot: true })

    await expect(refreshSelectedChannelsAction(["UCchan-1xxxxxxxxxxxxxxxx"])).rejects.toThrow(
      "Access denied"
    )
  })

  it("rejects oversized search queries before hitting the search service", async () => {
    await expect(searchChannelsAction("a".repeat(101))).rejects.toThrow("Invalid query")
    expect(mockGetSearchResults).not.toHaveBeenCalled()
  })

  it("caps how many channels one refresh can fan out to", async () => {
    const ids = Array.from({ length: MAX_SELECTED_CHANNELS + 1 }, (_, i) => `UCchan-${i}`.padEnd(24, "x"))

    await expect(refreshSelectedChannelsAction(ids)).rejects.toThrow("Too many channels")
    expect(mockRefreshChannelLiveStatus).not.toHaveBeenCalled()
  })

  it("rejects malformed channel ids", async () => {
    await expect(refreshSelectedChannelsAction(["UCchan-1xxxxxxxxxxxxxxxx", "../../etc"])).rejects.toThrow(
      "Invalid channel ids"
    )
    await expect(
      refreshSelectedChannelsAction("UCchan-1xxxxxxxxxxxxxxxx" as unknown as string[])
    ).rejects.toThrow("Invalid channel ids")
    expect(mockRefreshChannelLiveStatus).not.toHaveBeenCalled()
  })

  it("serves cached-only search results with a message when rate limited", async () => {
    mockIsRateLimited.mockResolvedValueOnce(true)
    const payload = { query: "abc", channels: [], cached: true, source: "search" as const }
    mockGetSearchResults.mockResolvedValueOnce(payload)

    await expect(searchChannelsAction("abc")).resolves.toEqual({ ...payload, notice: "limited" })
    expect(mockGetSearchResults).toHaveBeenCalledWith("abc", "all", true)
  })

  it("refreshes from the live cache only when rate limited", async () => {
    mockIsRateLimited.mockResolvedValueOnce(true)
    mockRefreshChannelLiveStatus.mockResolvedValue(null)
    const id = "UCchan-1xxxxxxxxxxxxxxxx"

    await expect(refreshSelectedChannelsAction([id])).resolves.toEqual([])
    expect(mockRefreshChannelLiveStatus).toHaveBeenCalledWith(id, true)
  })
})

/**
 * @jest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"
import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockCheckBotId = jest.fn<() => Promise<{ isBot: boolean }>>()
const mockGetSearchResults = jest.fn<(query: string) => Promise<SearchPayload>>()
const mockProjectConfigured = jest.fn<() => boolean>()
const mockRefreshChannelLiveStatus = jest.fn<
  (channelId: string) => Promise<ChannelResult | null>
>()

jest.unstable_mockModule("botid/server", () => ({
  checkBotId: mockCheckBotId,
}))

jest.unstable_mockModule("@/lib/search-service", () => ({
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
    expect(mockGetSearchResults).toHaveBeenCalledWith("abc")
  })

  it("returns an empty array on refresh when the project is not configured", async () => {
    mockProjectConfigured.mockReturnValueOnce(false)

    await expect(refreshSelectedChannelsAction(["a"])).resolves.toEqual([])
    expect(mockRefreshChannelLiveStatus).not.toHaveBeenCalled()
  })

  it("deduplicates ids, drops blanks, and filters null refreshes", async () => {
    mockRefreshChannelLiveStatus
      .mockResolvedValueOnce({
        channelId: "chan-1",
        title: "Channel One",
        description: "",
        thumbnailUrl: "",
        live: { status: "offline", checkedAt: "2026-03-06T00:00:00.000Z" },
      })
      .mockResolvedValueOnce(null)

    await expect(
      refreshSelectedChannelsAction(["chan-1", "", "chan-1", "chan-2"])
    ).resolves.toEqual([
      {
        channelId: "chan-1",
        title: "Channel One",
        description: "",
        thumbnailUrl: "",
        live: { status: "offline", checkedAt: "2026-03-06T00:00:00.000Z" },
      },
    ])

    expect(mockRefreshChannelLiveStatus).toHaveBeenCalledTimes(2)
    expect(mockRefreshChannelLiveStatus).toHaveBeenNthCalledWith(1, "chan-1")
    expect(mockRefreshChannelLiveStatus).toHaveBeenNthCalledWith(2, "chan-2")
  })

  it("rejects refresh requests from bots", async () => {
    mockCheckBotId.mockResolvedValueOnce({ isBot: true })

    await expect(refreshSelectedChannelsAction(["chan-1"])).rejects.toThrow(
      "Access denied"
    )
  })
})

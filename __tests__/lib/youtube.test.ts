/**
 * @jest-environment node
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"

const mockGetRequiredEnv = jest.fn<(name: string) => string>()
const mockHasYouTubeEnv = jest.fn<() => boolean>()

jest.unstable_mockModule("@/lib/env", () => ({
  getRequiredEnv: mockGetRequiredEnv,
  hasYouTubeEnv: mockHasYouTubeEnv,
}))

let getChannelsByIds: typeof import("@/lib/youtube").getChannelsByIds
let getLiveVideoForChannel: typeof import("@/lib/youtube").getLiveVideoForChannel
let searchChannels: typeof import("@/lib/youtube").searchChannels
let youtubeConfigured: typeof import("@/lib/youtube").youtubeConfigured

beforeAll(async () => {
  ;({
    getChannelsByIds,
    getLiveVideoForChannel,
    searchChannels,
    youtubeConfigured,
  } = await import("@/lib/youtube"))
})

function createJsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

describe("youtube helpers", () => {
  const fetchMock = jest.fn<typeof fetch>()

  beforeEach(() => {
    mockGetRequiredEnv.mockReturnValue("test-api-key")
    mockHasYouTubeEnv.mockReturnValue(true)
    fetchMock.mockReset()
    global.fetch = fetchMock
  })

  it("reports whether YouTube is configured", () => {
    mockHasYouTubeEnv.mockReturnValueOnce(false)

    expect(youtubeConfigured()).toBe(false)
  })

  it("builds a search request and normalizes the response", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        items: [
          {
            id: { channelId: "chan-1" },
            snippet: {
              title: "  Crash Out  ",
              description: "  Streams and clips  ",
              thumbnails: {
                medium: { url: "https://img.medium/channel.jpg" },
              },
            },
          },
          {
            id: { channelId: "" },
            snippet: { title: "Ignored" },
          },
        ],
      })
    )

    await expect(searchChannels("Crash Out", 3)).resolves.toEqual([
      {
        channelId: "chan-1",
        title: "Crash Out",
        description: "Streams and clips",
        thumbnailUrl: "https://img.medium/channel.jpg",
      },
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/search?"),
      expect.objectContaining({ cache: "no-store" })
    )

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get("part")).toBe("snippet")
    expect(url.searchParams.get("type")).toBe("channel")
    expect(url.searchParams.get("q")).toBe("Crash Out")
    expect(url.searchParams.get("maxResults")).toBe("3")
    expect(url.searchParams.get("key")).toBe("test-api-key")
  })

  it("returns an empty list without fetching when channel id input is empty", async () => {
    await expect(getChannelsByIds([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("maps channel responses and falls back to the default thumbnail", async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        items: [
          {
            id: "chan-1",
            snippet: {
              title: "Channel One",
              description: "  Ready to go  ",
              thumbnails: {
                default: { url: "https://img.default/channel.jpg" },
              },
            },
          },
          {
            id: "chan-2",
            snippet: {},
          },
        ],
      })
    )

    await expect(getChannelsByIds(["chan-1", "chan-2"])).resolves.toEqual([
      {
        channelId: "chan-1",
        title: "Channel One",
        description: "Ready to go",
        thumbnailUrl: "https://img.default/channel.jpg",
      },
    ])

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get("id")).toBe("chan-1,chan-2")
  })

  it("returns an offline live status when no live video is present", async () => {
    const isoSpy = jest
      .spyOn(Date.prototype, "toISOString")
      .mockReturnValue("2026-03-06T00:00:00.000Z")

    fetchMock.mockResolvedValueOnce(createJsonResponse({ items: [] }))

    await expect(getLiveVideoForChannel("chan-1")).resolves.toEqual({
      status: "offline",
      checkedAt: "2026-03-06T00:00:00.000Z",
    })

    isoSpy.mockRestore()
  })

  it("returns a live status with fallbacks when a live video exists", async () => {
    const isoSpy = jest
      .spyOn(Date.prototype, "toISOString")
      .mockReturnValue("2026-03-06T01:23:45.000Z")

    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        items: [
          {
            id: { videoId: "video-1" },
            snippet: {
              title: "  Live right now  ",
              publishedAt: "2026-03-05T23:00:00.000Z",
              thumbnails: {
                high: { url: "https://img.high/live.jpg" },
              },
            },
          },
        ],
      })
    )

    await expect(getLiveVideoForChannel("chan-1")).resolves.toEqual({
      status: "live",
      checkedAt: "2026-03-06T01:23:45.000Z",
      videoId: "video-1",
      title: "Live right now",
      thumbnailUrl: "https://img.high/live.jpg",
      startedAt: "2026-03-05T23:00:00.000Z",
    })

    isoSpy.mockRestore()
  })

  it("throws when the YouTube API returns a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({}, false, 403))

    await expect(searchChannels("blocked")).rejects.toThrow("Request failed with 403")
  })
})

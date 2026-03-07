/**
 * @jest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockGetSearchResults = jest.fn<(query: string) => Promise<SearchPayload>>()
const mockGetSeedResults = jest.fn<() => Promise<SearchPayload>>()
const mockGetSelectedChannels = jest.fn<(channelIds: string[]) => Promise<ChannelResult[]>>()
const mockProjectConfigured = jest.fn<() => boolean>()
const mockMultiwatchApp = jest.fn<(props: Record<string, unknown>) => ReactElement>(
  () => <div data-testid="multiwatch-app" />
)

jest.unstable_mockModule("@/lib/search-service", () => ({
  getSearchResults: mockGetSearchResults,
  getSeedResults: mockGetSeedResults,
  getSelectedChannels: mockGetSelectedChannels,
  projectConfigured: mockProjectConfigured,
}))

jest.unstable_mockModule("@/components/multiwatch-app", () => ({
  MultiwatchApp: mockMultiwatchApp,
}))

let PageContent: typeof import("@/app/page").PageContent

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    channelId: "chan-1",
    title: "Channel One",
    description: "",
    thumbnailUrl: "thumb.jpg",
    live: {
      status: "offline",
      checkedAt: "2026-03-06T00:00:00.000Z",
    },
    ...overrides,
  }
}

beforeAll(async () => {
  ;({ PageContent } = await import("@/app/page"))
})

describe("PageContent", () => {
  beforeEach(() => {
    mockGetSeedResults.mockReset()
    mockGetSearchResults.mockReset()
    mockGetSelectedChannels.mockReset()
    mockProjectConfigured.mockReset()
    mockMultiwatchApp.mockClear()
  })

  it("loads configured data and passes normalized props to MultiwatchApp", async () => {
    mockProjectConfigured.mockReturnValue(true)
    mockGetSeedResults.mockResolvedValue({
      query: "",
      channels: [makeChannel({ channelId: "seed-1", title: "Seed One" })],
      cached: true,
      source: "seed",
    })
    mockGetSearchResults.mockResolvedValue({
      query: "alpha",
      channels: [makeChannel({ channelId: "search-1", title: "Search One" })],
      cached: false,
      source: "search",
    })
    mockGetSelectedChannels.mockResolvedValue([makeChannel()])

    const view = await PageContent({
      searchParams: Promise.resolve({
        q: "alpha",
        channels: "chan-1,,chan-2",
      }),
    })

    render(view)

    expect(screen.getByTestId("multiwatch-app")).toBeInTheDocument()
    expect(mockGetSearchResults).toHaveBeenCalledWith("alpha")
    expect(mockGetSelectedChannels).toHaveBeenCalledWith(["chan-1", "chan-2"])
    expect(mockMultiwatchApp.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        initialQuery: "alpha",
        initialSeedResults: [expect.objectContaining({ channelId: "seed-1" })],
        initialResults: [expect.objectContaining({ channelId: "search-1" })],
        initialSelectedChannels: [expect.objectContaining({ channelId: "chan-1" })],
        configured: true,
        initialUpdatedAt: expect.any(String),
      })
    )
  })

  it("returns fallback app props when the project is not configured", async () => {
    mockProjectConfigured.mockReturnValue(false)

    const view = await PageContent({
      searchParams: Promise.resolve({
        q: ["ignored"],
        channels: ["ignored"],
      }),
    })

    render(view)

    expect(mockGetSeedResults).not.toHaveBeenCalled()
    expect(mockGetSearchResults).not.toHaveBeenCalled()
    expect(mockGetSelectedChannels).not.toHaveBeenCalled()
    expect(mockMultiwatchApp.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        initialQuery: "",
        initialSeedResults: [],
        initialResults: [],
        initialSelectedChannels: [],
        configured: false,
      })
    )
  })
})

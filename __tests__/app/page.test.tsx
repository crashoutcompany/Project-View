/**
 * @vitest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockGetSearchResults = vi.fn<(query: string) => Promise<SearchPayload>>()
const mockGetSeedResults = vi.fn<() => Promise<SearchPayload>>()
const mockGetSelectedChannels = vi.fn<(channelIds: string[]) => Promise<ChannelResult[]>>()
const mockProjectConfigured = vi.fn<() => boolean>()
const mockConfiguredPlatforms = vi.fn<() => Array<"youtube" | "twitch">>()
const mockHeaders = vi.fn<() => Promise<Headers>>()
const mockMultiwatchApp = vi.fn<(props: Record<string, unknown>) => ReactElement>(
  () => <div data-testid="multiwatch-app" />
)

vi.doMock("@/lib/search-service", () => ({
  getSearchResults: mockGetSearchResults,
  getSeedResults: mockGetSeedResults,
  getSelectedChannels: mockGetSelectedChannels,
  projectConfigured: mockProjectConfigured,
  configuredPlatforms: mockConfiguredPlatforms,
}))

vi.doMock("next/headers", () => ({
  headers: mockHeaders,
}))

vi.doMock("@/components/multiwatch-app", () => ({
  MultiwatchApp: mockMultiwatchApp,
}))

let PageContent: typeof import("@/app/page").PageContent

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
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
    mockConfiguredPlatforms.mockReturnValue(["youtube", "twitch"])
    mockHeaders.mockResolvedValue(new Headers({ host: "localhost:3000" }))
  })

  it("loads configured data and passes normalized props to MultiwatchApp", async () => {
    mockProjectConfigured.mockReturnValue(true)
    mockGetSeedResults.mockResolvedValue({
      query: "",
      channels: [makeChannel({ platform: "youtube", channelId: "seed-1", title: "Seed One" })],
      cached: true,
      source: "seed",
    })
    mockGetSearchResults.mockResolvedValue({
      query: "alpha",
      channels: [makeChannel({ platform: "youtube", channelId: "search-1", title: "Search One" })],
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
        platforms: ["youtube", "twitch"],
        twitchParents: ["localhost"],
        initialUpdatedAt: expect.any(String),
      })
    )
  })

  it("lists the request host and Vercel URLs as Twitch parents", async () => {
    vi.stubEnv("VERCEL_URL", "project-view-abc123.vercel.app")
    vi.stubEnv("VERCEL_BRANCH_URL", "project-view-git-feat.vercel.app")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "view.example.com")
    mockProjectConfigured.mockReturnValue(false)
    mockHeaders.mockResolvedValue(
      new Headers({ host: "internal:3000", "x-forwarded-host": "view.example.com" })
    )

    render(await PageContent({ searchParams: Promise.resolve({}) }))

    expect(mockMultiwatchApp.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        twitchParents: [
          "view.example.com",
          "internal",
          "project-view-abc123.vercel.app",
          "project-view-git-feat.vercel.app",
        ],
      })
    )
    vi.unstubAllEnvs()
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

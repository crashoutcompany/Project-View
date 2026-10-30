/**
 * @vitest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"

import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockSearchChannelsAction = vi.fn<
  (query: string, platform?: string) => Promise<SearchPayload>
>()
const mockRefreshSelectedChannelsAction = vi.fn<
  (channelIds: string[]) => Promise<ChannelResult[]>
>()

vi.doMock("@/app/actions", () => ({
  searchChannelsAction: mockSearchChannelsAction,
  refreshSelectedChannelsAction: mockRefreshSelectedChannelsAction,
}))

vi.doMock("@/components/channel-combobox", () => ({
  ChannelCombobox: ({
    query,
    results,
    disabled,
    onQueryChange,
    onAddChannel,
  }: {
    query: string
    results: ChannelResult[]
    disabled?: boolean
    onQueryChange: (value: string) => void
    onAddChannel: (channel: ChannelResult) => void
  }) => (
    <div>
      <label htmlFor="query-input">Query</label>
      <input
        id="query-input"
        value={query}
        disabled={disabled}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <button
        type="button"
        onClick={() => results[0] && onAddChannel(results[0])}
        disabled={results.length === 0}
      >
        Add first result
      </button>
    </div>
  ),
}))

vi.doMock("@/components/channel-results", () => ({
  ChannelResults: ({
    title,
    channels,
    selectedIds,
    onAddChannel,
    onRemoveChannel,
  }: {
    title: string
    channels: ChannelResult[]
    selectedIds: string[]
    onAddChannel: (channel: ChannelResult) => void
    onRemoveChannel: (channelId: string) => void
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {channels.map((channel) => (
        <div key={`${title}-${channel.channelId}`}>
          <span>{channel.title}</span>
          {selectedIds.includes(channel.channelId) ? (
            <button type="button" onClick={() => onRemoveChannel(channel.channelId)}>
              Remove {channel.channelId}
            </button>
          ) : (
            <button type="button" onClick={() => onAddChannel(channel)}>
              Add {channel.channelId}
            </button>
          )}
        </div>
      ))}
    </section>
  ),
}))

vi.doMock("@/components/live-grid", () => ({
  LiveGrid: ({
    channels,
    activeAudioChannelId,
  }: {
    channels: ChannelResult[]
    activeAudioChannelId: string | null
  }) => (
    <div data-testid="live-grid">
      {JSON.stringify({
        channelIds: channels.map((channel) => channel.channelId),
        activeAudioChannelId,
      })}
    </div>
  ),
}))

let MultiwatchApp: typeof import("@/components/multiwatch-app").MultiwatchApp

beforeAll(async () => {
  ;({ MultiwatchApp } = await import("@/components/multiwatch-app"))
})

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
    channelId: "chan-1",
    title: "Channel One",
    description: "Description",
    thumbnailUrl: "thumb.jpg",
    live: {
      status: "offline",
      checkedAt: "2026-03-06T00:00:00.000Z",
    },
    ...overrides,
  }
}

function renderApp(overrides: Partial<ComponentProps<typeof MultiwatchApp>> = {}) {
  const seedChannel = makeChannel()

  return render(
    <MultiwatchApp
      initialQuery=""
      initialResults={[]}
      initialSeedResults={[seedChannel]}
      initialSelectedChannels={[]}
      initialUpdatedAt="2026-03-06T00:00:00.000Z"
      configured
      platforms={["youtube"]}
      twitchParents={["localhost"]}
      {...overrides}
    />
  )
}

describe("MultiwatchApp", () => {
  beforeEach(() => {
    mockSearchChannelsAction.mockReset()
    mockRefreshSelectedChannelsAction.mockReset()
    window.history.pushState({}, "", "/")
  })

  it("filters suggestions by platform and re-runs the search for that platform", async () => {
    vi.useFakeTimers()
    mockSearchChannelsAction.mockResolvedValue({
      query: "alpha",
      channels: [],
      cached: false,
      source: "search",
    })
    renderApp({
      platforms: ["youtube", "twitch"],
      initialSeedResults: [
        makeChannel({ channelId: "chan-yt", title: "YouTube Seed" }),
        makeChannel({
          platform: "twitch",
          channelId: "tw:123",
          login: "seed",
          title: "Twitch Seed",
        }),
      ],
    })

    expect(screen.getByText("YouTube Seed")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Twitch" }))

    expect(screen.getByRole("button", { name: "Twitch" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByText("YouTube Seed")).not.toBeInTheDocument()
    expect(screen.getByText("Twitch Seed")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "alpha" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })

    expect(mockSearchChannelsAction).toHaveBeenLastCalledWith("alpha", "twitch")
  })

  it("hides the platform filter when only one platform is configured", () => {
    renderApp()

    expect(screen.queryByRole("group", { name: "Filter by platform" })).not.toBeInTheDocument()
  })

  it("debounces searches, trims the query, and updates results", async () => {
    vi.useFakeTimers()
    mockSearchChannelsAction.mockResolvedValueOnce({
      query: "alpha",
      channels: [makeChannel({ channelId: "chan-2", title: "Result Two" })],
      cached: false,
      source: "search",
    })

    renderApp()
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "  Alpha  " },
    })

    expect(window.location.search).toBe("?q=Alpha")
    expect(mockSearchChannelsAction).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(mockSearchChannelsAction).toHaveBeenCalledWith("Alpha", "all")
    })
    expect(screen.getByText("Result Two")).toBeInTheDocument()
  })

  it("adds and removes channels while keeping the URL in sync", () => {
    renderApp()

    fireEvent.click(screen.getByRole("button", { name: "Add first result" }))

    expect(screen.getByTestId("live-grid")).toHaveTextContent('"channelIds":["chan-1"]')
    expect(screen.getByTestId("live-grid")).toHaveTextContent(
      '"activeAudioChannelId":"chan-1"'
    )
    expect(window.location.search).toBe("?channels=chan-1")

    fireEvent.click(
      within(screen.getByRole("region", { name: "Selected" })).getByRole("button", {
        name: "Remove chan-1",
      })
    )

    expect(screen.getByTestId("live-grid")).toHaveTextContent('"channelIds":[]')
    expect(window.location.search).toBe("")
  })

  it("refreshes selected channels and applies the returned state", async () => {
    mockRefreshSelectedChannelsAction.mockResolvedValueOnce([
      makeChannel({
        channelId: "chan-1",
        title: "Channel One Updated",
        live: {
          status: "live",
          checkedAt: "2026-03-06T00:01:00.000Z",
          videoId: "video-1",
        },
      }),
    ])

    renderApp({
      initialSelectedChannels: [makeChannel()],
    })

    fireEvent.click(screen.getByLabelText("Refresh live state"))

    await waitFor(() => {
      expect(mockRefreshSelectedChannelsAction).toHaveBeenCalledWith(["chan-1"])
    })
    await waitFor(() => {
      expect(screen.getAllByText("Channel One Updated").length).toBeGreaterThan(0)
    })
  })

  it("lists live channels first in the sidebar but keeps the grid order", () => {
    const offline = makeChannel({ channelId: "chan-off", title: "Offline One" })
    const liveSmall = makeChannel({
      channelId: "chan-live-small",
      title: "Live Small",
      live: { status: "live", checkedAt: "x", videoId: "v1" },
    })
    const liveBig = makeChannel({
      channelId: "chan-live-big",
      title: "Live Big",
      live: { status: "live", checkedAt: "x", videoId: "v2" },
    })
    const unknown = makeChannel({
      channelId: "chan-unknown",
      title: "Unknown One",
      live: { status: "unknown", checkedAt: "x" },
    })

    renderApp({
      initialSeedResults: [unknown, offline, liveSmall, liveBig],
      initialSelectedChannels: [offline, liveSmall, liveBig],
    })

    const titlesIn = (name: string) =>
      within(screen.getByRole("region", { name }))
        .getAllByText(/One|Live/)
        .map((element) => element.textContent)

    expect(titlesIn("Selected")).toEqual(["Live Small", "Live Big", "Offline One"])
    expect(titlesIn("Suggestions")).toEqual(["Unknown One"])
    expect(screen.getByTestId("live-grid")).toHaveTextContent(
      '"channelIds":["chan-off","chan-live-small","chan-live-big"]'
    )
  })

  it("leaves selected channels out of suggestions and results, keeping live first", async () => {
    vi.useFakeTimers()
    const offline = makeChannel({ channelId: "chan-off", title: "Offline One" })
    const unknown = makeChannel({
      channelId: "chan-unknown",
      title: "Unknown One",
      live: { status: "unknown", checkedAt: "x" },
    })
    const liveSmall = makeChannel({
      channelId: "chan-live-small",
      title: "Live Small",
      live: { status: "live", checkedAt: "x", videoId: "v1" },
    })
    const liveBig = makeChannel({
      channelId: "chan-live-big",
      title: "Live Big",
      live: { status: "live", checkedAt: "x", videoId: "v2" },
    })
    mockSearchChannelsAction.mockResolvedValueOnce({
      query: "alpha",
      channels: [offline, liveSmall, unknown, liveBig],
      cached: false,
      source: "search",
    })

    renderApp({
      initialSeedResults: [unknown, offline, liveSmall, liveBig],
      initialSelectedChannels: [liveBig],
    })

    const titlesIn = (name: string) =>
      within(screen.getByRole("region", { name }))
        .getAllByText(/One|Live/)
        .map((element) => element.textContent)

    expect(titlesIn("Suggestions")).toEqual(["Live Small", "Unknown One", "Offline One"])

    fireEvent.change(screen.getByLabelText("Query"), { target: { value: "alpha" } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Results" })).toBeInTheDocument()
    })
    expect(titlesIn("Results")).toEqual(["Live Small", "Offline One", "Unknown One"])
    expect(titlesIn("Selected")).toEqual(["Live Big"])
  })

  it("does not search when the project is unconfigured", () => {
    vi.useFakeTimers()
    renderApp({
      configured: false,
    })

    expect(screen.getByLabelText("Query")).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "Alpha" },
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(mockSearchChannelsAction).not.toHaveBeenCalled()
  })

  it("logs search errors instead of crashing", async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    mockSearchChannelsAction.mockRejectedValueOnce(new Error("boom"))

    renderApp()
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "Alpha" },
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    vi.useRealTimers()

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled()
    })

    errorSpy.mockRestore()
  })

  it("hides the chat button until a channel is selected, and closes chat when the last one goes", () => {
    renderApp()

    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Add first result" }))
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }))

    const chat = screen.getByRole("complementary", { name: "Live chat" })
    expect(chat).toHaveAttribute("data-open", "true")
    expect(within(chat).getByRole("tab", { name: /Channel One/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument()

    fireEvent.click(
      within(screen.getByRole("region", { name: "Selected" })).getByRole("button", {
        name: "Remove chan-1",
      })
    )

    expect(chat).toHaveAttribute("data-open", "false")
    expect(screen.queryByRole("button", { name: "Open chat" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Add first result" }))
    expect(screen.getByRole("button", { name: "Open chat" })).toBeInTheDocument()
  })
})

/**
 * @jest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"

import type { ChannelResult, SearchPayload } from "@/lib/types"

const mockSearchChannelsAction = jest.fn<(query: string) => Promise<SearchPayload>>()
const mockRefreshSelectedChannelsAction = jest.fn<
  (channelIds: string[]) => Promise<ChannelResult[]>
>()

jest.unstable_mockModule("@/app/actions", () => ({
  searchChannelsAction: mockSearchChannelsAction,
  refreshSelectedChannelsAction: mockRefreshSelectedChannelsAction,
}))

jest.unstable_mockModule("@/components/channel-combobox", () => ({
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

jest.unstable_mockModule("@/components/channel-results", () => ({
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

jest.unstable_mockModule("@/components/live-grid", () => ({
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
      {...overrides}
    />
  )
}

describe("MultiwatchApp", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockSearchChannelsAction.mockReset()
    mockRefreshSelectedChannelsAction.mockReset()
    window.history.pushState({}, "", "/")
  })

  it("debounces searches, trims the query, and updates results", async () => {
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
      jest.advanceTimersByTime(300)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockSearchChannelsAction).toHaveBeenCalledWith("Alpha")
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

  it("does not search when the project is unconfigured", () => {
    renderApp({
      configured: false,
    })

    expect(screen.getByLabelText("Query")).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "Alpha" },
    })

    act(() => {
      jest.advanceTimersByTime(300)
    })

    expect(mockSearchChannelsAction).not.toHaveBeenCalled()
  })

  it("logs search errors instead of crashing", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    mockSearchChannelsAction.mockRejectedValueOnce(new Error("boom"))

    renderApp()
    fireEvent.change(screen.getByLabelText("Query"), {
      target: { value: "Alpha" },
    })

    await act(async () => {
      jest.advanceTimersByTime(300)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled()
    })

    errorSpy.mockRestore()
  })
})

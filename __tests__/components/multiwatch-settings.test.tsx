/**
 * @vitest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"

import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, Settings } from "@/lib/settings"
import type { ChannelResult } from "@/lib/types"

const mockRefreshSelectedChannelsAction = vi.fn<
  (channelIds: string[]) => Promise<ChannelResult[]>
>()

vi.doMock("@/app/actions", () => ({
  searchChannelsAction: vi.fn(),
  refreshSelectedChannelsAction: mockRefreshSelectedChannelsAction,
}))

vi.doMock("@/components/channel-combobox", () => ({ ChannelCombobox: () => null }))
vi.doMock("@/components/channel-results", () => ({ ChannelResults: () => null }))
vi.doMock("@/components/live-grid", () => ({
  LiveGrid: ({
    channels,
    activeAudioChannelId,
    layout,
  }: {
    channels: ChannelResult[]
    activeAudioChannelId: string | null
    layout: string
  }) => (
    <div data-testid="live-grid">
      {JSON.stringify({
        channelIds: channels.map((channel) => channel.channelId),
        activeAudioChannelId,
        layout,
      })}
    </div>
  ),
}))

let MultiwatchApp: typeof import("@/components/multiwatch-app").MultiwatchApp

beforeAll(async () => {
  ;({ MultiwatchApp } = await import("@/components/multiwatch-app"))
})

function makeChannel(channelId: string, status: "live" | "offline"): ChannelResult {
  return {
    platform: "youtube",
    channelId,
    title: `Channel ${channelId}`,
    description: "",
    thumbnailUrl: "",
    live: { status, checkedAt: "2026-10-30T00:00:00.000Z", videoId: status === "live" ? "v" : undefined },
  }
}

function store(settings: Partial<Settings>) {
  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({ ...DEFAULT_SETTINGS, ...settings })
  )
  window.dispatchEvent(new StorageEvent("storage", { key: SETTINGS_STORAGE_KEY }))
}

function grid() {
  return JSON.parse(screen.getByTestId("live-grid").textContent ?? "{}")
}

function renderApp(overrides: Partial<ComponentProps<typeof MultiwatchApp>> = {}) {
  return render(
    <MultiwatchApp
      initialQuery=""
      initialResults={[]}
      initialSelectedChannels={[]}
      initialUpdatedAt="2026-10-30T00:00:00.000Z"
      configured
      platforms={["youtube"]}
      twitchParents={["localhost"]}
      {...overrides}
    />
  )
}

async function refresh() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh live state" }))
  })
}

describe("MultiwatchApp settings", () => {
  beforeEach(() => {
    mockRefreshSelectedChannelsAction.mockReset()
    window.localStorage.clear()
    window.dispatchEvent(new StorageEvent("storage", { key: null }))
    window.history.pushState({}, "", "/")
  })

  it("passes the stored grid layout to the grid", () => {
    store({ gridLayout: "two-columns" })
    renderApp()

    expect(grid().layout).toBe("two-columns")
  })

  it("auto-removes a stream after two missed checks and undoes it", async () => {
    store({ autoRemoveOffline: true })
    renderApp({
      initialSelectedChannels: [makeChannel("UCaxxxxxxxxxxxxxxxxxxxxx", "live"), makeChannel("UCbxxxxxxxxxxxxxxxxxxxxx", "live")],
    })
    mockRefreshSelectedChannelsAction.mockResolvedValue([
      makeChannel("UCaxxxxxxxxxxxxxxxxxxxxx", "offline"),
      makeChannel("UCbxxxxxxxxxxxxxxxxxxxxx", "live"),
    ])

    await refresh()
    expect(grid().channelIds).toEqual(["UCaxxxxxxxxxxxxxxxxxxxxx", "UCbxxxxxxxxxxxxxxxxxxxxx"])

    await refresh()
    expect(grid().channelIds).toEqual(["UCbxxxxxxxxxxxxxxxxxxxxx"])
    expect(window.location.search).toBe("?channels=UCbxxxxxxxxxxxxxxxxxxxxx")
    expect(screen.getByRole("status")).toHaveTextContent("Channel UCaxxxxxxxxxxxxxxxxxxxxx went offline")

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(grid().channelIds).toEqual(["UCbxxxxxxxxxxxxxxxxxxxxx", "UCaxxxxxxxxxxxxxxxxxxxxx"])
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    // Restored streams are not removed again until they have been live.
    await refresh()
    await refresh()
    expect(grid().channelIds.toSorted()).toEqual(["UCaxxxxxxxxxxxxxxxxxxxxx", "UCbxxxxxxxxxxxxxxxxxxxxx"])
  })

  it("keeps offline streams when auto-remove is off", async () => {
    renderApp({ initialSelectedChannels: [makeChannel("UCaxxxxxxxxxxxxxxxxxxxxx", "live")] })
    mockRefreshSelectedChannelsAction.mockResolvedValue([makeChannel("UCaxxxxxxxxxxxxxxxxxxxxx", "offline")])

    await refresh()
    await refresh()
    await refresh()
    expect(grid().channelIds).toEqual(["UCaxxxxxxxxxxxxxxxxxxxxx"])
  })

  it("reopens the last streams when the URL has none", async () => {
    store({ rememberLastStreams: true, lastChannelIds: ["UCaxxxxxxxxxxxxxxxxxxxxx", "UCbxxxxxxxxxxxxxxxxxxxxx"] })
    mockRefreshSelectedChannelsAction.mockResolvedValue([
      makeChannel("UCaxxxxxxxxxxxxxxxxxxxxx", "offline"),
      makeChannel("UCbxxxxxxxxxxxxxxxxxxxxx", "live"),
    ])

    renderApp()

    await waitFor(() => expect(grid().channelIds).toEqual(["UCaxxxxxxxxxxxxxxxxxxxxx", "UCbxxxxxxxxxxxxxxxxxxxxx"]))
    expect(mockRefreshSelectedChannelsAction).toHaveBeenCalledWith(["UCaxxxxxxxxxxxxxxxxxxxxx", "UCbxxxxxxxxxxxxxxxxxxxxx"])
    expect(grid().activeAudioChannelId).toBe("UCbxxxxxxxxxxxxxxxxxxxxx")
    expect(window.location.search).toBe("?channels=UCaxxxxxxxxxxxxxxxxxxxxx%2CUCbxxxxxxxxxxxxxxxxxxxxx")
  })

  it("does not restore over a shared link", () => {
    store({ rememberLastStreams: true, lastChannelIds: ["UCaxxxxxxxxxxxxxxxxxxxxx"] })
    window.history.pushState({}, "", "/?channels=UCzxxxxxxxxxxxxxxxxxxxxx")
    renderApp({ initialSelectedChannels: [makeChannel("UCzxxxxxxxxxxxxxxxxxxxxx", "live")] })

    expect(mockRefreshSelectedChannelsAction).not.toHaveBeenCalled()
  })

  it("remembers the current streams when the setting is on", () => {
    store({ rememberLastStreams: true })
    renderApp({ initialSelectedChannels: [makeChannel("UCzxxxxxxxxxxxxxxxxxxxxx", "live")] })

    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}").lastChannelIds).toEqual([
      "UCzxxxxxxxxxxxxxxxxxxxxx",
    ])
  })

  it("forgets the remembered streams when the setting is turned off", () => {
    store({ rememberLastStreams: false, lastChannelIds: ["UCaxxxxxxxxxxxxxxxxxxxxx"] })
    renderApp()

    expect(mockRefreshSelectedChannelsAction).not.toHaveBeenCalled()
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}").lastChannelIds).toEqual([])
  })
})

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
      initialSeedResults={[]}
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
      initialSelectedChannels: [makeChannel("UCa", "live"), makeChannel("UCb", "live")],
    })
    mockRefreshSelectedChannelsAction.mockResolvedValue([
      makeChannel("UCa", "offline"),
      makeChannel("UCb", "live"),
    ])

    await refresh()
    expect(grid().channelIds).toEqual(["UCa", "UCb"])

    await refresh()
    expect(grid().channelIds).toEqual(["UCb"])
    expect(window.location.search).toBe("?channels=UCb")
    expect(screen.getByRole("status")).toHaveTextContent("Channel UCa went offline")

    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(grid().channelIds).toEqual(["UCb", "UCa"])
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    // Restored streams are not removed again until they have been live.
    await refresh()
    await refresh()
    expect(grid().channelIds.toSorted()).toEqual(["UCa", "UCb"])
  })

  it("keeps offline streams when auto-remove is off", async () => {
    renderApp({ initialSelectedChannels: [makeChannel("UCa", "live")] })
    mockRefreshSelectedChannelsAction.mockResolvedValue([makeChannel("UCa", "offline")])

    await refresh()
    await refresh()
    await refresh()
    expect(grid().channelIds).toEqual(["UCa"])
  })

  it("reopens the last streams when the URL has none", async () => {
    store({ rememberLastStreams: true, lastChannelIds: ["UCa", "UCb"] })
    mockRefreshSelectedChannelsAction.mockResolvedValue([
      makeChannel("UCa", "offline"),
      makeChannel("UCb", "live"),
    ])

    renderApp()

    await waitFor(() => expect(grid().channelIds).toEqual(["UCa", "UCb"]))
    expect(mockRefreshSelectedChannelsAction).toHaveBeenCalledWith(["UCa", "UCb"])
    expect(grid().activeAudioChannelId).toBe("UCb")
    expect(window.location.search).toBe("?channels=UCa%2CUCb")
  })

  it("does not restore over a shared link", () => {
    store({ rememberLastStreams: true, lastChannelIds: ["UCa"] })
    window.history.pushState({}, "", "/?channels=UCz")
    renderApp({ initialSelectedChannels: [makeChannel("UCz", "live")] })

    expect(mockRefreshSelectedChannelsAction).not.toHaveBeenCalled()
  })

  it("remembers the current streams when the setting is on", () => {
    store({ rememberLastStreams: true })
    renderApp({ initialSelectedChannels: [makeChannel("UCz", "live")] })

    expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}").lastChannelIds).toEqual([
      "UCz",
    ])
  })
})

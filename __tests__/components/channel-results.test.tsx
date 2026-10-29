/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"

import type { ChannelResult } from "@/lib/types"

import { ChannelResults } from "@/components/channel-results"

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
    channelId: "chan-1",
    title: "Channel One",
    description: "Description",
    thumbnailUrl: "thumb.jpg",
    live: {
      status: "live",
      checkedAt: "2026-03-06T00:00:00.000Z",
      videoId: "video-1",
    },
    ...overrides,
  }
}

describe("ChannelResults", () => {
  it("renders the empty state", () => {
    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={0}
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByText("Nothing here")).toBeInTheDocument()
  })

  it("renders a tooltip title and add action for unselected channels", () => {
    const onAddChannel = vi.fn()
    const channel = makeChannel()

    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[channel]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={0}
        onAddChannel={onAddChannel}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByText("Live")).toBeInTheDocument()
    expect(
      screen.getByTitle((value) => value.includes("Channel One") && value.includes("Description"))
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /add/i }))

    expect(onAddChannel).toHaveBeenCalledWith(channel)
  })

  it("shows viewer count and uptime on live channels", () => {
    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[
          makeChannel({
            live: {
              status: "live",
              checkedAt: "x",
              videoId: "video-1",
              startedAt: "2026-03-06T00:00:00.000Z",
              viewerCount: 1500,
            },
          }),
        ]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={Date.parse("2026-03-06T01:05:00.000Z")}
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByTitle("1500 watching")).toHaveTextContent("1.5K watching")
    expect(screen.getByText("live 1h 5m")).toBeInTheDocument()
  })

  it("badges Twitch rows and shows LIVE, viewers and uptime from Helix", () => {
    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[
          makeChannel(),
          makeChannel({
            platform: "twitch",
            channelId: "tw:9",
            login: "crash",
            title: "Crash Twitch",
            live: {
              status: "live",
              checkedAt: "x",
              startedAt: "2026-03-06T00:00:00.000Z",
              viewerCount: 23400,
            },
          }),
        ]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={Date.parse("2026-03-06T02:30:00.000Z")}
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    const twitchRow = screen.getByText("Crash Twitch").closest("li")!
    expect(within(twitchRow).getByTitle("Twitch")).toBeInTheDocument()
    expect(within(twitchRow).getByText("Live")).toBeInTheDocument()
    expect(within(twitchRow).getByTitle("23400 watching")).toHaveTextContent("23.4K watching")
    expect(within(twitchRow).getByText("live 2h 30m")).toBeInTheDocument()
    expect(screen.getByTitle("YouTube")).toBeInTheDocument()
  })

  it("uses one Add style for live and offline rows, stretched over the whole row", () => {
    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[
          makeChannel(),
          makeChannel({
            channelId: "chan-2",
            title: "Channel Two",
            live: { status: "offline", checkedAt: "x" },
          }),
        ]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={0}
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    const liveAdd = screen.getByRole("button", { name: "Add Channel One" })
    const offlineAdd = screen.getByRole("button", { name: "Add Channel Two" })

    expect(liveAdd.className).toBe(offlineAdd.className)
    expect(liveAdd).toHaveClass("after:inset-0")
  })

  it("falls back to initials when a channel has no thumbnail", () => {
    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[makeChannel({ thumbnailUrl: "" })]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        now={0}
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByText("CO")).toBeInTheDocument()
  })

  it("renders a remove action for selected channels", () => {
    const onRemoveChannel = vi.fn()

    render(
      <ChannelResults
        title="Selected"
        description="Chosen streams"
        channels={[makeChannel({ live: { status: "offline", checkedAt: "x" } })]}
        selectedIds={["chan-1"]}
        emptyMessage="Nothing here"
        now={0}
        onAddChannel={() => {}}
        onRemoveChannel={onRemoveChannel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove Channel One" }))

    expect(onRemoveChannel).toHaveBeenCalledWith("chan-1")
    expect(screen.queryByText(/live/i)).not.toBeInTheDocument()
  })
})

/**
 * @jest-environment jsdom
 */

import { describe, expect, it, jest } from "@jest/globals"
import { fireEvent, render, screen } from "@testing-library/react"

import type { ChannelResult } from "@/lib/types"

import { ChannelResults } from "@/components/channel-results"

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
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
        onAddChannel={() => {}}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByText("Nothing here")).toBeInTheDocument()
  })

  it("renders a tooltip title and add action for unselected channels", () => {
    const onAddChannel = jest.fn()
    const channel = makeChannel()

    render(
      <ChannelResults
        title="Results"
        description="Search results"
        channels={[channel]}
        selectedIds={[]}
        emptyMessage="Nothing here"
        onAddChannel={onAddChannel}
        onRemoveChannel={() => {}}
      />
    )

    expect(screen.getByText("live")).toBeInTheDocument()
    expect(
      screen.getByTitle((value) => value.includes("Channel One") && value.includes("Description"))
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /add/i }))

    expect(onAddChannel).toHaveBeenCalledWith(channel)
  })

  it("renders a remove action for selected channels", () => {
    const onRemoveChannel = jest.fn()

    render(
      <ChannelResults
        title="Selected"
        description="Chosen streams"
        channels={[makeChannel({ live: { status: "offline", checkedAt: "x" } })]}
        selectedIds={["chan-1"]}
        emptyMessage="Nothing here"
        onAddChannel={() => {}}
        onRemoveChannel={onRemoveChannel}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Remove Channel One" }))

    expect(onRemoveChannel).toHaveBeenCalledWith("chan-1")
    expect(screen.getByText("offline")).toBeInTheDocument()
  })
})

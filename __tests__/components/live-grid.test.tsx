/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from "@jest/globals"
import { render, screen } from "@testing-library/react"

import { LiveGrid } from "@/components/live-grid"
import { LiveTile } from "@/components/live-tile"
import type { ChannelResult } from "@/lib/types"

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

describe("LiveGrid", () => {
  it("renders the empty state when no channels are selected", () => {
    render(<LiveGrid channels={[]} activeAudioChannelId={null} />)

    expect(screen.getByText("No streams yet")).toBeInTheDocument()
  })

  it("applies a larger grid layout as the number of channels grows", () => {
    const channels = Array.from({ length: 7 }, (_, index) =>
      makeChannel({
        channelId: `chan-${index + 1}`,
        title: `Channel ${index + 1}`,
      })
    )

    const { container } = render(
      <LiveGrid channels={channels} activeAudioChannelId="chan-2" />
    )

    expect(container.firstChild).toHaveClass("2xl:grid-cols-4")
    expect(screen.getAllByText(/is offline$/)).toHaveLength(7)
  })
})

describe("LiveTile", () => {
  it("renders an iframe for live channels and unmutes the active audio tile", () => {
    render(
      <LiveTile
        channel={makeChannel({
          live: {
            status: "live",
            checkedAt: "2026-03-06T00:00:00.000Z",
            videoId: "video-1",
          },
        })}
        activeAudio
      />
    )

    const iframe = screen.getByTitle("Channel One live stream")
    expect(iframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.youtube.com/embed/video-1")
    )
    expect(iframe).toHaveAttribute("src", expect.stringContaining("mute=0"))
  })

  it("renders the offline placeholder when there is no live video", () => {
    render(<LiveTile channel={makeChannel()} activeAudio={false} />)

    expect(screen.getByText("Channel One is offline")).toBeInTheDocument()
  })
})

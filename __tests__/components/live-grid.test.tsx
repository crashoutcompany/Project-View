/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { LiveGrid } from "@/components/live-grid"
import { LiveTile } from "@/components/live-tile"
import type { ChannelResult } from "@/lib/types"

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

describe("LiveGrid", () => {
  it("renders the empty state when no channels are selected", () => {
    render(<LiveGrid channels={[]} activeAudioChannelId={null} twitchParents={["localhost"]} />)

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
      <LiveGrid channels={channels} activeAudioChannelId="chan-2" twitchParents={["localhost"]} />
    )

    expect(container.firstChild).toHaveClass("2xl:grid-cols-4")
    expect(screen.getAllByText("Offline")).toHaveLength(7)
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
        twitchParents={["localhost"]}
      />
    )

    const iframe = screen.getByTitle("Channel One live stream")
    expect(iframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.youtube.com/embed/video-1")
    )
    expect(iframe).toHaveAttribute("src", expect.stringContaining("mute=0"))
  })

  it("embeds the Twitch player with every parent host and mutes inactive tiles", () => {
    render(
      <LiveTile
        channel={makeChannel({
          platform: "twitch",
          channelId: "tw:123",
          login: "crashout",
          live: { status: "live", checkedAt: "2026-03-06T00:00:00.000Z" },
        })}
        activeAudio={false}
        twitchParents={["localhost", "project-view.vercel.app"]}
      />
    )

    const src = new URL(screen.getByTitle("Channel One live stream").getAttribute("src") ?? "")
    expect(src.origin).toBe("https://player.twitch.tv")
    expect(src.searchParams.get("channel")).toBe("crashout")
    expect(src.searchParams.getAll("parent")).toEqual(["localhost", "project-view.vercel.app"])
    expect(src.searchParams.get("muted")).toBe("true")
    expect(screen.getByText("Twitch")).toBeInTheDocument()
  })

  it("does not embed a live Twitch channel without a login", () => {
    render(
      <LiveTile
        channel={makeChannel({
          platform: "twitch",
          channelId: "tw:123",
          live: { status: "live", checkedAt: "2026-03-06T00:00:00.000Z" },
        })}
        activeAudio
        twitchParents={["localhost"]}
      />
    )

    expect(screen.queryByTitle("Channel One live stream")).not.toBeInTheDocument()
  })

  it("renders the offline placeholder with the channel name and initials", () => {
    render(
      <LiveTile channel={makeChannel({ thumbnailUrl: "" })} activeAudio={false} twitchParents={["localhost"]} />
    )

    expect(screen.getByText("Channel One")).toBeInTheDocument()
    expect(screen.getByText("Offline")).toBeInTheDocument()
    expect(screen.getByText("CO")).toBeInTheDocument()
    expect(screen.queryByTitle("Channel One live stream")).not.toBeInTheDocument()
  })

  it("labels an unknown live state instead of calling it offline", () => {
    render(
      <LiveTile
        channel={makeChannel({ live: { status: "unknown", checkedAt: "x" } })}
        activeAudio={false}
        twitchParents={["localhost"]}
      />
    )

    expect(screen.getByText("Status unknown")).toBeInTheDocument()
    expect(screen.queryByText("Offline")).not.toBeInTheDocument()
  })
})

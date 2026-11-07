/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest"
import { act, render, screen } from "@testing-library/react"

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

  it("packs 16:9 tiles to the measured size in fit, and keeps the CSS grid in fill", () => {
    let resize: ResizeObserverCallback = () => {}
    const originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    try {
      const channels = ["a", "b", "c", "d"].map((id) => makeChannel({ channelId: id }))
      const props = { channels, activeAudioChannelId: null, twitchParents: ["localhost"] }
      const { container, rerender } = render(<LiveGrid {...props} />)
      const grid = container.firstChild as HTMLElement
      expect(grid).not.toHaveAttribute("data-packed")

      act(() => {
        resize(
          [{ contentRect: { width: 1720, height: 1081 } } as ResizeObserverEntry],
          {} as ResizeObserver
        )
      })

      expect(grid).toHaveAttribute("data-packed")
      expect(grid.style.gridTemplateColumns).toBe("repeat(2, 859px)")
      expect(grid.style.gridAutoRows).toBe("515px")

      rerender(<LiveGrid {...props} fit="fill" />)
      expect(grid).not.toHaveAttribute("data-packed")
      expect(grid).toHaveClass("auto-rows-fr")

      rerender(<LiveGrid {...props} layout="two-columns" />)
      expect(grid).not.toHaveAttribute("data-packed")
    } finally {
      globalThis.ResizeObserver = originalResizeObserver
    }
  })

  it("lays the spotlit stream over the screen and makes the rest inert, without remounting", () => {
    const channels = ["a", "b", "c"].map((id) =>
      makeChannel({
        channelId: id,
        title: `Channel ${id}`,
        live: { status: "live", checkedAt: "x", videoId: `v-${id}` },
      })
    )
    const props = { channels, activeAudioChannelId: "a", twitchParents: ["localhost"] }
    const { container, rerender } = render(<LiveGrid {...props} focusedChannelId="b" />)
    const frame = screen.getByTitle("Channel b live stream")

    rerender(<LiveGrid {...props} focusedChannelId="b" spotlightChannelId="b" />)

    const tile = (id: string) =>
      container.querySelector<HTMLElement>(`[data-tile][data-channel-id="${id}"]`)!
    expect(tile("b")).toHaveClass("fixed", "inset-0")
    expect(tile("b")).not.toHaveAttribute("inert")
    expect(tile("a")).toHaveAttribute("inert")
    expect(tile("c")).toHaveAttribute("aria-hidden", "true")
    // No focus ring while a single stream fills the screen.
    expect(tile("b")).not.toHaveAttribute("data-focused")
    expect(screen.getByTitle("Channel b live stream")).toBe(frame)
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
    expect(screen.getAllByText("CO")).toHaveLength(2)
    expect(screen.queryByTitle("Channel One live stream")).not.toBeInTheDocument()
  })

  it("shows the streamer, stream title and platform in a header above the player", () => {
    render(
      <LiveTile
        channel={makeChannel({
          platform: "twitch",
          login: "one",
          live: { status: "live", checkedAt: "x", title: "Ranked grind" },
        })}
        activeAudio={false}
        twitchParents={["localhost"]}
      />
    )

    const tile = screen.getByTitle("Channel One live stream").closest("[data-tile]")!
    const header = tile.firstElementChild as HTMLElement
    expect(header).toHaveTextContent("Channel One")
    expect(header).toHaveTextContent("Ranked grind")
    expect(header).toHaveTextContent("Twitch")
    expect(header).toHaveClass("h-8")
  })

  it("letterboxes the player in fit and crops it to cover in fill", () => {
    const channel = makeChannel({
      live: { status: "live", checkedAt: "x", videoId: "video-1" },
    })
    const { rerender } = render(
      <LiveTile channel={channel} activeAudio={false} twitchParents={["localhost"]} />
    )
    const frame = screen.getByTitle("Channel One live stream")
    expect(frame).toHaveClass("size-full")

    rerender(
      <LiveTile channel={channel} activeAudio={false} twitchParents={["localhost"]} fit="fill" />
    )
    expect(screen.getByTitle("Channel One live stream")).toBe(frame)
    expect(frame).toHaveClass("absolute", "w-[max(100cqw,calc(100cqh*16/9))]")
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

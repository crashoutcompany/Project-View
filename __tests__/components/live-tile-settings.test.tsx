/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { LiveGrid } from "@/components/live-grid"
import { LiveTile } from "@/components/live-tile"
import type { ChannelResult } from "@/lib/types"

function liveChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
    channelId: "chan-1",
    title: "Channel One",
    description: "",
    thumbnailUrl: "",
    live: { status: "live", checkedAt: "2026-10-30T00:00:00.000Z", videoId: "video-1" },
    ...overrides,
  }
}

describe("LiveTile audio and quality", () => {
  it("mutes and unmutes through postMessage without reloading the player", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <LiveTile channel={liveChannel()} activeAudio={false} twitchParents={["localhost"]} />
    )
    const iframe = screen.getByTitle("Channel One live stream") as HTMLIFrameElement
    const src = iframe.getAttribute("src")
    expect(src).toContain("enablejsapi=1")
    expect(src).toContain("mute=1")

    const postMessage = vi.spyOn(iframe.contentWindow as Window, "postMessage")
    fireEvent.load(iframe)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(postMessage).toHaveBeenLastCalledWith(
      JSON.stringify({ event: "command", func: "mute", args: [] }),
      "https://www.youtube.com"
    )

    rerender(<LiveTile channel={liveChannel()} activeAudio twitchParents={["localhost"]} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(iframe.getAttribute("src")).toBe(src)
    expect(postMessage).toHaveBeenLastCalledWith(
      JSON.stringify({ event: "command", func: "unMute", args: [] }),
      "https://www.youtube.com"
    )
  })

  it("requests the default quality", () => {
    render(
      <LiveTile channel={liveChannel()} activeAudio quality="medium" twitchParents={["localhost"]} />
    )

    expect(screen.getByTitle("Channel One live stream")).toHaveAttribute(
      "src",
      expect.stringContaining("vq=large")
    )
  })

  it("moves audio focus from the speaker button and a tap into the player, not on hover", () => {
    const onFocusAudio = vi.fn()
    render(
      <LiveTile
        channel={liveChannel()}
        activeAudio={false}
        twitchParents={["localhost"]}
        onFocusAudio={onFocusAudio}
      />
    )

    const iframe = screen.getByTitle("Channel One live stream")
    fireEvent.pointerEnter(iframe.parentElement!.parentElement!, { pointerType: "mouse" })
    expect(onFocusAudio).not.toHaveBeenCalled()

    fireEvent.focus(iframe)
    fireEvent.click(screen.getByRole("button", { name: "Play audio from Channel One" }))

    expect(onFocusAudio).toHaveBeenCalledTimes(2)
    expect(onFocusAudio).toHaveBeenCalledWith("chan-1")
  })

  it("shows no speaker button unless audio follows focus", () => {
    render(<LiveTile channel={liveChannel()} activeAudio twitchParents={["localhost"]} />)

    expect(screen.queryByRole("button", { name: /audio/ })).not.toBeInTheDocument()
  })
})

describe("LiveTile fullscreen saver", () => {
  const twitch = liveChannel({ platform: "twitch", channelId: "tw:1", login: "one" })

  // Commands as "func" (YouTube) or "eventName:params" (Twitch).
  function sentCommands(postMessage: { mock: { calls: unknown[][] } }): string[] {
    return postMessage.mock.calls.map(([message]) => {
      if (typeof message === "string") {
        const parsed = JSON.parse(message)
        return parsed.func ?? parsed.event
      }
      const { eventName, params } = message as { eventName: string; params: unknown }
      return `${eventName}:${params}`
    })
  }

  it("lowers Twitch quality, restores the reported quality, and leaves it alone when off", () => {
    vi.useFakeTimers()
    const props = { channel: twitch, activeAudio: false, twitchParents: ["localhost"] }
    const { rerender } = render(<LiveTile {...props} />)
    const iframe = screen.getByTitle("Channel One live stream") as HTMLIFrameElement
    const postMessage = vi.spyOn(iframe.contentWindow as Window, "postMessage")
    fireEvent.load(iframe)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(sentCommands(postMessage).some((command) => command.startsWith("setQuality"))).toBe(false)

    // The player reports its quality before fullscreen starts.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://player.twitch.tv",
          source: iframe.contentWindow,
          data: {
            namespace: "twitch-embed-player-proxy",
            eventName: "UPDATE_STATE",
            params: { quality: "720p60", playback: "Playing" },
          },
        })
      )
    })

    postMessage.mockClear()
    rerender(<LiveTile {...props} saverAction="lower-quality" />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(sentCommands(postMessage)).toContain("setQuality:160p30")

    postMessage.mockClear()
    rerender(<LiveTile {...props} />)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    const restored = sentCommands(postMessage)
    expect(restored).toContain("setQuality:720p60")
    expect(restored).not.toContain("setQuality:160p30")
    expect(iframe.getAttribute("src")).toContain("channel=one")
    vi.useRealTimers()
  })

  it("pauses a stream and resumes it on exit", () => {
    vi.useFakeTimers()
    const props = { channel: liveChannel(), activeAudio: false, twitchParents: ["localhost"] }
    const { rerender } = render(<LiveTile {...props} />)
    const iframe = screen.getByTitle("Channel One live stream") as HTMLIFrameElement
    const postMessage = vi.spyOn(iframe.contentWindow as Window, "postMessage")
    fireEvent.load(iframe)

    rerender(<LiveTile {...props} saverAction="pause" />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(sentCommands(postMessage)).toContain("pauseVideo")

    postMessage.mockClear()
    rerender(<LiveTile {...props} />)
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(sentCommands(postMessage)).toContain("playVideo")
    vi.useRealTimers()
  })
})

describe("LiveGrid layouts", () => {
  const channels = ["a", "b", "c"].map((id) =>
    liveChannel({ channelId: id, title: `Channel ${id}`, live: { status: "offline", checkedAt: "x" } })
  )

  it.each([
    ["one-column", "auto-rows-[minmax(min(60svh,24rem),1fr)]"],
    ["two-columns", "sm:grid-cols-2"],
    ["featured", "md:grid-cols-[3fr_1fr]"],
  ] as const)("applies the %s layout", (layout, className) => {
    const { container } = render(
      <LiveGrid channels={channels} activeAudioChannelId={null} twitchParents={[]} layout={layout} />
    )

    expect(container.firstChild).toHaveClass(className)
  })

  it("saves resources on every stream but the fullscreen one", () => {
    const live = [
      liveChannel({ channelId: "yt", title: "YouTube one" }),
      liveChannel({ platform: "twitch", channelId: "tw:1", login: "one", title: "Twitch one" }),
      liveChannel({ channelId: "full", title: "Fullscreen", live: { status: "live", checkedAt: "x", videoId: "v2" } }),
    ]
    vi.useFakeTimers()
    render(
      <LiveGrid
        channels={live}
        activeAudioChannelId={null}
        twitchParents={["localhost"]}
        fullscreenChannelId="full"
        saverSettings={{ saveResourcesOnFullscreen: true, pauseOthersOnFullscreen: false }}
      />
    )
    const spies = live.map((channel) => {
      const iframe = screen.getByTitle(`${channel.title} live stream`) as HTMLIFrameElement
      const spy = vi.spyOn(iframe.contentWindow as Window, "postMessage")
      fireEvent.load(iframe)
      return spy
    })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    const [youtube, twitch, full] = spies.map((spy) => JSON.stringify(spy.mock.calls))

    expect(youtube).toContain("pauseVideo")
    expect(twitch).toContain("160p30")
    expect(twitch).not.toContain('"pause"')
    expect(full).not.toContain("pauseVideo")
    vi.useRealTimers()
  })

  it("makes the first stream big in the featured layout", () => {
    const { container } = render(
      <LiveGrid channels={channels} activeAudioChannelId={null} twitchParents={[]} layout="featured" />
    )
    const [big, small] = Array.from((container.firstChild as HTMLElement).children) as HTMLElement[]

    expect(big).toHaveClass("md:col-start-1")
    expect(big.style.getPropertyValue("--featured-span")).toBe("2")
    expect(small).toHaveClass("md:col-start-2")
  })
})

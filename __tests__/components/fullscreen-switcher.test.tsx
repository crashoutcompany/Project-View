/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"

import { FullscreenSwitcher, SWITCHER_LABEL_MS } from "@/components/fullscreen-switcher"
import type { ChannelResult } from "@/lib/types"

function makeChannel(channelId: string): ChannelResult {
  return {
    platform: "twitch",
    channelId,
    title: `Channel ${channelId}`,
    description: "",
    thumbnailUrl: "",
    live: { status: "live", checkedAt: "x" },
  }
}

const channels = ["a", "b"].map(makeChannel)

function label() {
  return screen.getByText(/\d \/ \d/).closest("p")!
}

describe("FullscreenSwitcher", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows the stream's name for a moment after each switch", () => {
    vi.useFakeTimers()
    const { rerender } = render(
      <FullscreenSwitcher channels={channels} channelId="a" onStep={() => {}} />
    )

    expect(label()).toHaveTextContent("1 / 2 · Channel a")
    expect(label()).not.toHaveClass("opacity-0")
    act(() => vi.advanceTimersByTime(SWITCHER_LABEL_MS))
    expect(label()).toHaveClass("opacity-0")

    rerender(<FullscreenSwitcher channels={channels} channelId="b" onStep={() => {}} />)
    expect(label()).toHaveTextContent("2 / 2 · Channel b")
    expect(label()).not.toHaveClass("opacity-0")
  })

  it("renders nothing with a single stream", () => {
    const { container } = render(
      <FullscreenSwitcher channels={[makeChannel("a")]} channelId="a" onStep={() => {}} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})

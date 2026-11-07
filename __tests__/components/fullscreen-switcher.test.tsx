/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import {
  ARROW_IDLE_MS,
  FullscreenSwitcher,
  SWITCHER_LABEL_MS,
} from "@/components/fullscreen-switcher"
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

  it("shows an arrow while the mouse moves at its edge, and fades it once the mouse goes still", () => {
    vi.useFakeTimers()
    render(<FullscreenSwitcher channels={channels} channelId="a" onStep={() => {}} />)
    const next = screen.getByRole("button", { name: "Next stream" })

    expect(next.firstElementChild).toHaveClass(
      "pointer-fine:opacity-0",
      "group-data-[pointing]/arrow:opacity-100",
      "group-focus-visible/arrow:opacity-100"
    )
    expect(next).not.toHaveAttribute("data-pointing")

    fireEvent.pointerMove(next, { pointerType: "mouse" })
    expect(next).toHaveAttribute("data-pointing")
    expect(screen.getByRole("button", { name: "Previous stream" })).not.toHaveAttribute(
      "data-pointing"
    )

    act(() => vi.advanceTimersByTime(ARROW_IDLE_MS - 100))
    fireEvent.pointerMove(next, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(ARROW_IDLE_MS - 100))
    expect(next).toHaveAttribute("data-pointing")

    act(() => vi.advanceTimersByTime(200))
    expect(next).not.toHaveAttribute("data-pointing")

    fireEvent.pointerMove(next, { pointerType: "mouse" })
    fireEvent.pointerLeave(next)
    expect(next).not.toHaveAttribute("data-pointing")

    // Touch doesn't hover; those arrows are always shown by CSS.
    fireEvent.pointerMove(next, { pointerType: "touch" })
    expect(next).not.toHaveAttribute("data-pointing")
  })

  it("renders nothing with a single stream", () => {
    const { container } = render(
      <FullscreenSwitcher channels={[makeChannel("a")]} channelId="a" onStep={() => {}} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * @jest-environment jsdom
 */

import { describe, expect, it, jest } from "@jest/globals"
import { fireEvent, render, screen } from "@testing-library/react"

import type { ChannelResult } from "@/lib/types"

import { ChannelCombobox } from "@/components/channel-combobox"

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

describe("ChannelCombobox", () => {
  it("renders the loading state and forwards query changes", () => {
    const onQueryChange = jest.fn()

    render(
      <ChannelCombobox
        query="alpha"
        results={[makeChannel()]}
        loading
        onQueryChange={onQueryChange}
        onAddChannel={() => {}}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /search: alpha/i }))

    expect(
      screen.getByText("Looking up channels and checking who is live...")
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText("Type a YouTube channel name..."), {
      target: { value: "beta" },
    })

    expect(onQueryChange).toHaveBeenCalledWith("beta")
  })

  it("renders matches and adds a selected channel", () => {
    const onAddChannel = jest.fn()
    const channel = makeChannel()

    render(
      <ChannelCombobox
        query=""
        results={[channel]}
        loading={false}
        onQueryChange={() => {}}
        onAddChannel={onAddChannel}
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: /search channels, handles, or live creators/i,
      })
    )

    expect(screen.getByText("Channel One")).toBeInTheDocument()
    expect(screen.getByText("live")).toBeInTheDocument()

    fireEvent.click(screen.getByText("Channel One"))

    expect(onAddChannel).toHaveBeenCalledWith(channel)
  })

  it("disables the search input when requested", () => {
    render(
      <ChannelCombobox
        query=""
        results={[]}
        loading={false}
        disabled
        onQueryChange={() => {}}
        onAddChannel={() => {}}
      />
    )

    expect(
      screen.getByRole("button", {
        name: /search channels, handles, or live creators/i,
      })
    ).toBeDisabled()
  })
})

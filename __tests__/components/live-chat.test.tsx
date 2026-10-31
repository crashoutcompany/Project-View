/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { LiveChatPanel, resolveActiveChatId } from "@/components/live-chat"
import type { ChannelResult } from "@/lib/types"

const checkedAt = "2026-10-30T00:00:00.000Z"

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
    channelId: "yt-1",
    title: "YouTube One",
    description: "",
    thumbnailUrl: "",
    live: { status: "live", checkedAt, videoId: "vid1" },
    ...overrides,
  }
}

const youtube = makeChannel()
const twitch = makeChannel({
  platform: "twitch",
  channelId: "tw:2",
  login: "twitchtwo",
  title: "Twitch Two",
  live: { status: "live", checkedAt },
})
const offline = makeChannel({
  channelId: "yt-3",
  title: "Offline Three",
  live: { status: "offline", checkedAt },
})

function renderPanel(props: Partial<Parameters<typeof LiveChatPanel>[0]> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <LiveChatPanel
      open
      channels={[offline, youtube, twitch]}
      twitchParents={["localhost"]}
      onClose={onClose}
      {...props}
    />
  )

  return { ...utils, onClose }
}

describe("resolveActiveChatId", () => {
  it("keeps the requested tab, else falls back to the first live channel", () => {
    expect(resolveActiveChatId([offline, youtube], "yt-3")).toBe("yt-3")
    expect(resolveActiveChatId([offline, youtube], "gone")).toBe("yt-1")
    expect(resolveActiveChatId([offline], null)).toBe("yt-3")
    expect(resolveActiveChatId([], "yt-1")).toBeNull()
  })
})

describe("LiveChatPanel", () => {
  it("shows one tab per channel and loads only the active chat", () => {
    renderPanel()

    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "YouTubeOffline Three",
      "YouTubeYouTube One",
      "TwitchTwitch Two",
    ])
    expect(screen.getByRole("tab", { name: /YouTube One/ })).toHaveAttribute("aria-selected", "true")

    const frames = document.querySelectorAll("iframe")
    expect(frames).toHaveLength(1)
    expect(frames[0].src).toBe("https://www.youtube.com/live_chat?v=vid1&embed_domain=localhost")
  })

  it("switches tabs and swaps the iframe", () => {
    renderPanel()

    fireEvent.click(screen.getByRole("tab", { name: /Twitch Two/ }))

    const frames = document.querySelectorAll("iframe")
    expect(frames).toHaveLength(1)
    expect(frames[0].src).toContain("https://www.twitch.tv/embed/twitchtwo/chat?")
    expect(new URL(frames[0].src).searchParams.getAll("parent")).toContain("project-view-rho.vercel.app")
  })

  it("shows an empty state for a channel that isn't live", () => {
    renderPanel()

    fireEvent.click(screen.getByRole("tab", { name: /Offline Three/ }))

    expect(document.querySelector("iframe")).toBeNull()
    expect(screen.getByText(/isn't live/)).toBeInTheDocument()
  })

  it("falls back to another tab when the active channel is removed", () => {
    const { rerender, onClose } = renderPanel()
    fireEvent.click(screen.getByRole("tab", { name: /Twitch Two/ }))

    rerender(
      <LiveChatPanel open channels={[offline, youtube]} twitchParents={["localhost"]} onClose={onClose} />
    )

    expect(screen.getByRole("tab", { name: /YouTube One/ })).toHaveAttribute("aria-selected", "true")
    expect(document.querySelector("iframe")?.src).toContain("youtube.com/live_chat")
  })

  it("loads no iframe while closed", () => {
    renderPanel({ open: false })

    expect(document.querySelector("iframe")).toBeNull()
  })

  it("closes from the close button and the backdrop", () => {
    const { onClose, container } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Close chat" }))
    fireEvent.click(container.querySelector(".bg-black\\/60")!)

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

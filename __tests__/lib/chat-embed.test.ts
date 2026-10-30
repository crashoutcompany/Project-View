import { describe, expect, it } from "vitest"

import { chatEmbedUrl, youtubeChatUrl } from "@/lib/chat-embed"
import { twitchChatUrl } from "@/lib/twitch-embed"
import type { ChannelResult } from "@/lib/types"

function makeChannel(overrides: Partial<ChannelResult> = {}): ChannelResult {
  return {
    platform: "youtube",
    channelId: "UC1",
    title: "Channel",
    description: "",
    thumbnailUrl: "",
    live: { status: "live", checkedAt: "2026-10-30T00:00:00.000Z", videoId: "vid123" },
    ...overrides,
  }
}

const options = { twitchParents: ["project-view-git-x.vercel.app"], hostname: "localhost", dark: false }

describe("chat embeds", () => {
  it("builds the Twitch chat URL with every parent and the dark flag", () => {
    const url = twitchChatUrl("crash", ["localhost", "view.example.com"], true)

    expect(url.startsWith("https://www.twitch.tv/embed/crash/chat?")).toBe(true)
    expect(url.endsWith("&darkpopout")).toBe(true)
    expect(new URL(url).searchParams.getAll("parent")).toEqual(["localhost", "view.example.com"])
    expect(twitchChatUrl("crash", ["localhost"], false)).not.toContain("darkpopout")
  })

  it("builds the YouTube live chat URL with the embed domain", () => {
    const url = new URL(youtubeChatUrl("vid123", "localhost"))

    expect(url.origin + url.pathname).toBe("https://www.youtube.com/live_chat")
    expect(url.searchParams.get("v")).toBe("vid123")
    expect(url.searchParams.get("embed_domain")).toBe("localhost")
  })

  it("uses the current hostname as the YouTube embed domain", () => {
    expect(chatEmbedUrl(makeChannel(), { ...options, hostname: "project-view-rho.vercel.app" })).toBe(
      "https://www.youtube.com/live_chat?v=vid123&embed_domain=project-view-rho.vercel.app"
    )
  })

  it("always allows prod plus the current and server hosts as Twitch parents", () => {
    const url = chatEmbedUrl(makeChannel({ platform: "twitch", channelId: "tw:1", login: "crash" }), {
      ...options,
      dark: true,
    })

    expect(new URL(url!).searchParams.getAll("parent")).toEqual([
      "project-view-rho.vercel.app",
      "localhost",
      "project-view-git-x.vercel.app",
    ])
    expect(url).toContain("darkpopout")
  })

  it("returns null when there is no chat to show", () => {
    const offline = { status: "offline" as const, checkedAt: "2026-10-30T00:00:00.000Z" }

    expect(chatEmbedUrl(makeChannel({ live: offline }), options)).toBeNull()
    expect(chatEmbedUrl(makeChannel({ live: { ...offline, status: "unknown" } }), options)).toBeNull()
    expect(
      chatEmbedUrl(makeChannel({ live: { status: "live", checkedAt: offline.checkedAt } }), options)
    ).toBeNull()
    expect(chatEmbedUrl(makeChannel({ platform: "twitch", login: undefined }), options)).toBeNull()
  })
})

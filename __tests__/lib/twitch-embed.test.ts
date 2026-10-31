import { describe, expect, it } from "vitest"

import { toHostname, twitchParentHosts, twitchPlayerUrl } from "@/lib/twitch-embed"

describe("twitch embed", () => {
  it("reduces hosts and URLs to bare hostnames", () => {
    expect(toHostname("localhost:3000")).toBe("localhost")
    expect(toHostname("https://Project-View-git-x.vercel.app/path")).toBe("project-view-git-x.vercel.app")
    expect(toHostname("a.example.com, b.example.com")).toBe("a.example.com")
    expect(toHostname("evil.com&parent=x")).toBeNull()
    expect(toHostname(undefined)).toBeNull()
  })

  it("dedupes parents for localhost, previews and prod", () => {
    expect(
      twitchParentHosts([
        "localhost:3000",
        null,
        "project-view-abc.vercel.app",
        "view.example.com",
        "view.example.com",
      ])
    ).toEqual(["localhost", "project-view-abc.vercel.app", "view.example.com"])
  })

  it("builds a player URL with every parent and the mute state", () => {
    const url = new URL(twitchPlayerUrl("crash", ["localhost", "view.example.com"], true))

    expect(url.origin).toBe("https://player.twitch.tv")
    expect(url.searchParams.get("channel")).toBe("crash")
    expect(url.searchParams.getAll("parent")).toEqual(["localhost", "view.example.com"])
    expect(url.searchParams.get("muted")).toBe("true")
    expect(url.searchParams.get("autoplay")).toBe("true")
  })
})

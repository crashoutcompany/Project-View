import { describe, expect, it, vi } from "vitest"

import { muteMessage, postToPlayer, qualityMessage } from "@/lib/embed-control"

describe("embed control", () => {
  it("builds YouTube iframe API commands", () => {
    expect(muteMessage("youtube", true)).toEqual({
      targetOrigin: "https://www.youtube.com",
      message: JSON.stringify({ event: "command", func: "mute", args: [] }),
    })
    expect(JSON.parse(muteMessage("youtube", false).message as string).func).toBe("unMute")
    expect(JSON.parse(qualityMessage("youtube", "high")?.message as string).args).toEqual(["hd1080"])
  })

  it("builds Twitch player proxy commands", () => {
    expect(muteMessage("twitch", false)).toEqual({
      targetOrigin: "https://player.twitch.tv",
      message: { eventName: "setMuted", params: false, namespace: "twitch-embed-player-proxy" },
    })
    expect(qualityMessage("twitch", "low")?.message).toMatchObject({
      eventName: "setQuality",
      params: "160p30",
    })
  })

  it("sends nothing for auto quality", () => {
    expect(qualityMessage("youtube", "auto")).toBeNull()
    expect(qualityMessage("twitch", "auto")).toBeNull()
  })

  it("posts to the player window with its origin", () => {
    const postMessage = vi.fn()
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement

    postToPlayer(frame, muteMessage("twitch", true))
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "setMuted" }),
      "https://player.twitch.tv"
    )

    expect(() => postToPlayer(null, muteMessage("youtube", true))).not.toThrow()
  })
})

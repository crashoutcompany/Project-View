import { describe, expect, it, vi } from "vitest"

import {
  muteMessage,
  parsePlayerMessage,
  playbackMessage,
  postToPlayer,
  qualityMessage,
  twitchQualityMessage,
} from "@/lib/embed-control"

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

  it("builds pause, play and explicit quality commands", () => {
    expect(JSON.parse(playbackMessage("youtube", false).message as string).func).toBe("pauseVideo")
    expect(JSON.parse(playbackMessage("youtube", true).message as string).func).toBe("playVideo")
    expect(playbackMessage("twitch", false).message).toMatchObject({ eventName: "pause" })
    expect(twitchQualityMessage("auto").message).toMatchObject({
      eventName: "setQuality",
      params: "auto",
    })
  })
})

describe("parsePlayerMessage", () => {
  it("reads YouTube player state from its own origin only", () => {
    const paused = JSON.stringify({ event: "infoDelivery", info: { playerState: 2 } })
    expect(parsePlayerMessage("https://www.youtube.com", paused)).toEqual({ playing: false })
    expect(
      parsePlayerMessage("https://www.youtube.com", JSON.stringify({ event: "onStateChange", info: 1 }))
    ).toEqual({ playing: true })
    expect(parsePlayerMessage("https://evil.example", paused)).toBeNull()
    expect(parsePlayerMessage("https://www.youtube.com", "{not json")).toBeNull()
    expect(
      parsePlayerMessage("https://www.youtube.com", JSON.stringify({ event: "infoDelivery", info: {} }))
    ).toBeNull()
  })

  it("reads Twitch playback and quality from its own origin only", () => {
    const update = {
      namespace: "twitch-embed-player-proxy",
      eventName: "UPDATE_STATE",
      params: { playback: "Playing", quality: "720p60" },
    }
    expect(parsePlayerMessage("https://player.twitch.tv", update)).toEqual({
      playing: true,
      quality: "720p60",
    })
    expect(
      parsePlayerMessage("https://player.twitch.tv", {
        ...update,
        params: { paused: true },
      })
    ).toEqual({ playing: false })
    expect(
      parsePlayerMessage("https://player.twitch.tv", { namespace: "twitch-embed", eventName: "pause" })
    ).toEqual({ playing: false })
    expect(parsePlayerMessage("https://www.youtube.com", update)).toBeNull()
    expect(parsePlayerMessage("https://player.twitch.tv", { eventName: "pause" })).toBeNull()
  })
})

import { describe, expect, it } from "vitest"

import { resolveAudioChannelId } from "@/lib/audio-focus"

const base = {
  channelIds: ["a", "b", "c"],
  activeAudioChannelId: "a",
  focusedChannelId: "b",
  fullscreenChannelId: null,
  settings: { audioFollowsFocus: false, muteOthersOnFullscreen: false },
}

describe("resolveAudioChannelId", () => {
  it("keeps the active stream when focus following is off", () => {
    expect(resolveAudioChannelId(base)).toBe("a")
  })

  it("follows the focused stream when the setting is on", () => {
    expect(
      resolveAudioChannelId({ ...base, settings: { ...base.settings, audioFollowsFocus: true } })
    ).toBe("b")
  })

  it("gives the fullscreen stream the audio and restores on exit", () => {
    const settings = { audioFollowsFocus: true, muteOthersOnFullscreen: true }

    expect(resolveAudioChannelId({ ...base, settings, fullscreenChannelId: "c" })).toBe("c")
    expect(resolveAudioChannelId({ ...base, settings, fullscreenChannelId: null })).toBe("b")
  })

  it("ignores fullscreen when that setting is off", () => {
    expect(resolveAudioChannelId({ ...base, fullscreenChannelId: "c" })).toBe("a")
  })

  it("ignores ids that are no longer on the wall", () => {
    expect(
      resolveAudioChannelId({
        ...base,
        channelIds: ["c"],
        settings: { audioFollowsFocus: true, muteOthersOnFullscreen: true },
        fullscreenChannelId: "x",
      })
    ).toBeNull()
  })
})

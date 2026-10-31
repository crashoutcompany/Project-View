import { describe, expect, it } from "vitest"

import {
  fullscreenSaverAction,
  IDLE_SAVER_MEMO,
  SaverAction,
  SaverMemo,
  transitionSaver,
} from "@/lib/fullscreen-saver"
import type { PlayerState } from "@/lib/embed-control"
import type { Platform } from "@/lib/types"

const SAVE_ONLY = { saveResourcesOnFullscreen: true, pauseOthersOnFullscreen: false }
const PAUSE_ON = { saveResourcesOnFullscreen: true, pauseOthersOnFullscreen: true }
const ALL_OFF = { saveResourcesOnFullscreen: false, pauseOthersOnFullscreen: false }

// Commands as short strings, e.g. "twitch:setQuality:160p30" or "youtube:pauseVideo".
function describeCommands(commands: ReturnType<typeof transitionSaver>["commands"]) {
  return commands.map(({ targetOrigin, message }) => {
    if (typeof message === "string") {
      return `youtube:${JSON.parse(message).func}`
    }
    const { eventName, params } = message as { eventName: string; params: unknown }
    expect(targetOrigin).toBe("https://player.twitch.tv")
    return params === null ? `twitch:${eventName}` : `twitch:${eventName}:${params}`
  })
}

function step(
  memo: SaverMemo,
  next: SaverAction | null,
  platform: Platform,
  player: PlayerState = {},
  requestedQuality: "auto" | "low" | "medium" | "high" = "auto"
) {
  const result = transitionSaver(memo, next, { platform, player, requestedQuality })
  return { memo: result.memo, commands: describeCommands(result.commands) }
}

describe("fullscreenSaverAction", () => {
  const base = { channelId: "a", fullscreenChannelId: "b" }

  it("does nothing without a fullscreen stream, or for the fullscreen stream itself", () => {
    expect(
      fullscreenSaverAction({ ...base, platform: "twitch", fullscreenChannelId: null, settings: PAUSE_ON })
    ).toBeNull()
    expect(
      fullscreenSaverAction({ ...base, platform: "twitch", fullscreenChannelId: "a", settings: PAUSE_ON })
    ).toBeNull()
  })

  it("does nothing when both settings are off", () => {
    expect(fullscreenSaverAction({ ...base, platform: "twitch", settings: ALL_OFF })).toBeNull()
    expect(fullscreenSaverAction({ ...base, platform: "youtube", settings: ALL_OFF })).toBeNull()
  })

  it("lowers Twitch and pauses YouTube when only save resources is on", () => {
    expect(fullscreenSaverAction({ ...base, platform: "twitch", settings: SAVE_ONLY })).toBe(
      "lower-quality"
    )
    expect(fullscreenSaverAction({ ...base, platform: "youtube", settings: SAVE_ONLY })).toBe("pause")
  })

  it("pauses every platform when pause is on, with or without save resources", () => {
    for (const settings of [PAUSE_ON, { ...PAUSE_ON, saveResourcesOnFullscreen: false }]) {
      expect(fullscreenSaverAction({ ...base, platform: "twitch", settings })).toBe("pause")
      expect(fullscreenSaverAction({ ...base, platform: "youtube", settings })).toBe("pause")
    }
  })
})

describe("transitionSaver: save resources (pause off)", () => {
  it("lowers Twitch quality and restores the reported previous quality", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch", { quality: "720p60" })
    expect(lowered.commands).toEqual(["twitch:setQuality:160p30"])
    expect(lowered.memo).toMatchObject({ action: "lower-quality", previousQuality: "720p60" })

    // The player now reports the low rendition; the memo keeps the old one.
    const restored = step(lowered.memo, null, "twitch", { quality: "160p30" })
    expect(restored.commands).toEqual(["twitch:setQuality:720p60"])
    expect(restored.memo).toEqual(IDLE_SAVER_MEMO)
  })

  it("restores the requested quality when the player never reported one", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch")
    expect(step(lowered.memo, null, "twitch").commands).toEqual(["twitch:setQuality:auto"])
    expect(step(lowered.memo, null, "twitch", {}, "medium").commands).toEqual([
      "twitch:setQuality:480p30",
    ])
  })

  it("never pauses Twitch on this path", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch", { playing: true })
    expect(lowered.commands.some((command) => command.includes("pause"))).toBe(false)
    expect(lowered.memo.pausedByUs).toBe(false)
  })

  it("pauses a playing YouTube stream and resumes it on exit", () => {
    const paused = step(IDLE_SAVER_MEMO, "pause", "youtube", { playing: true })
    expect(paused.commands).toEqual(["youtube:pauseVideo"])
    expect(paused.memo.pausedByUs).toBe(true)

    expect(step(paused.memo, null, "youtube", { playing: false }).commands).toEqual([
      "youtube:playVideo",
    ])
  })

  it("leaves a YouTube stream the viewer paused alone, and doesn't resume it", () => {
    const skipped = step(IDLE_SAVER_MEMO, "pause", "youtube", { playing: false })
    expect(skipped.commands).toEqual([])
    expect(skipped.memo.pausedByUs).toBe(false)

    expect(step(skipped.memo, null, "youtube", { playing: false }).commands).toEqual([])
  })

  it("treats an unknown player state as playing", () => {
    const paused = step(IDLE_SAVER_MEMO, "pause", "youtube")
    expect(paused.commands).toEqual(["youtube:pauseVideo"])
    expect(paused.memo.pausedByUs).toBe(true)
  })
})

describe("transitionSaver: pause on", () => {
  it("pauses Twitch without touching its quality, then resumes it", () => {
    const paused = step(IDLE_SAVER_MEMO, "pause", "twitch", { playing: true, quality: "720p60" })
    expect(paused.commands).toEqual(["twitch:pause"])
    expect(paused.memo).toEqual({ action: "pause", previousQuality: null, pausedByUs: true })

    const resumed = step(paused.memo, null, "twitch", { playing: false })
    expect(resumed.commands).toEqual(["twitch:play"])
  })

  it("does not resume a Twitch stream the viewer had paused", () => {
    const skipped = step(IDLE_SAVER_MEMO, "pause", "twitch", { playing: false })
    expect(skipped.commands).toEqual([])
    expect(step(skipped.memo, null, "twitch").commands).toEqual([])
  })

  it("pauses YouTube the same way", () => {
    const paused = step(IDLE_SAVER_MEMO, "pause", "youtube", { playing: true })
    expect(paused.commands).toEqual(["youtube:pauseVideo"])
    expect(step(paused.memo, null, "youtube").commands).toEqual(["youtube:playVideo"])
  })
})

describe("transitionSaver: toggling mid-fullscreen", () => {
  it("turning pause on restores the lowered quality before pausing", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch", { quality: "chunked" })
    const paused = step(lowered.memo, "pause", "twitch", { quality: "160p30", playing: true })

    expect(paused.commands).toEqual(["twitch:setQuality:chunked", "twitch:pause"])
    expect(paused.memo).toEqual({ action: "pause", previousQuality: null, pausedByUs: true })
    expect(step(paused.memo, null, "twitch").commands).toEqual(["twitch:play"])
  })

  it("turning pause off resumes what we paused, then lowers quality", () => {
    const paused = step(IDLE_SAVER_MEMO, "pause", "twitch", { playing: true, quality: "720p60" })
    const lowered = step(paused.memo, "lower-quality", "twitch", { playing: false, quality: "720p60" })

    expect(lowered.commands).toEqual(["twitch:play", "twitch:setQuality:160p30"])
    expect(lowered.memo).toMatchObject({ action: "lower-quality", previousQuality: "720p60" })
  })

  it("turning both settings off mid-fullscreen restores immediately", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch", { quality: "480p30" })
    expect(step(lowered.memo, null, "twitch").commands).toEqual(["twitch:setQuality:480p30"])
  })

  it("re-sends only the apply commands when the action is unchanged", () => {
    const lowered = step(IDLE_SAVER_MEMO, "lower-quality", "twitch", { quality: "480p30" })
    const again = step(lowered.memo, "lower-quality", "twitch", { quality: "160p30" })
    expect(again.commands).toEqual(["twitch:setQuality:160p30"])
    expect(again.memo).toBe(lowered.memo)

    const skipped = step(IDLE_SAVER_MEMO, "pause", "youtube", { playing: false })
    expect(step(skipped.memo, "pause", "youtube").commands).toEqual([])
  })

  it("does nothing while idle", () => {
    expect(step(IDLE_SAVER_MEMO, null, "twitch")).toEqual({ memo: IDLE_SAVER_MEMO, commands: [] })
  })
})

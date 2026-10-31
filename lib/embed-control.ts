import type { Platform } from "@/lib/types"
import type { StreamQuality } from "@/lib/settings"

// Commands sent into the cross-origin players with postMessage, so mute and
// quality can change without reloading the iframe. Both players may ignore
// them (see the PR notes): YouTube no longer honours quality requests, and
// Twitch's proxy protocol is the one its embed script uses, not a public API.

export const YOUTUBE_ORIGIN = "https://www.youtube.com"
export const TWITCH_PLAYER_ORIGIN = "https://player.twitch.tv"

// Legacy YouTube quality names; `undefined` leaves the player on auto.
const YOUTUBE_QUALITY: Record<StreamQuality, string | undefined> = {
  auto: undefined,
  high: "hd1080",
  medium: "large",
  low: "small",
}

// "chunked" is Twitch's name for the source rendition.
const TWITCH_QUALITY: Record<StreamQuality, string | undefined> = {
  auto: undefined,
  high: "chunked",
  medium: "480p30",
  low: "160p30",
}

export function youtubeQualityParam(quality: StreamQuality) {
  return YOUTUBE_QUALITY[quality]
}

export type PlayerMessage = { targetOrigin: string; message: unknown }

function youtubeCommand(func: string, args: unknown[] = []): PlayerMessage {
  return {
    targetOrigin: YOUTUBE_ORIGIN,
    message: JSON.stringify({ event: "command", func, args }),
  }
}

function twitchCommand(eventName: string, params: unknown): PlayerMessage {
  return {
    targetOrigin: TWITCH_PLAYER_ORIGIN,
    message: { eventName, params, namespace: "twitch-embed-player-proxy" },
  }
}

export function muteMessage(platform: Platform, muted: boolean): PlayerMessage {
  return platform === "twitch"
    ? twitchCommand("setMuted", muted)
    : youtubeCommand(muted ? "mute" : "unMute")
}

export function qualityMessage(platform: Platform, quality: StreamQuality): PlayerMessage | null {
  const value = platform === "twitch" ? TWITCH_QUALITY[quality] : YOUTUBE_QUALITY[quality]

  if (!value) {
    return null
  }

  return platform === "twitch"
    ? twitchCommand("setQuality", value)
    : youtubeCommand("setPlaybackQuality", [value])
}

export function playbackMessage(platform: Platform, playing: boolean): PlayerMessage {
  return platform === "twitch"
    ? twitchCommand(playing ? "play" : "pause", null)
    : youtubeCommand(playing ? "playVideo" : "pauseVideo")
}

/** Sets a Twitch rendition by name, including "auto". */
export function twitchQualityMessage(value: string): PlayerMessage {
  return twitchCommand("setQuality", value)
}

// The smallest video rendition most Twitch channels offer.
export const TWITCH_LOWEST_QUALITY = "160p30"

export function twitchRequestedQuality(quality: StreamQuality) {
  return TWITCH_QUALITY[quality] ?? "auto"
}

/** Asks a YouTube player to start sending its state (infoDelivery events). */
export function youtubeListeningMessage(id: string): PlayerMessage {
  return {
    targetOrigin: YOUTUBE_ORIGIN,
    message: JSON.stringify({ event: "listening", id, channel: "widget" }),
  }
}

// What a player last told us about itself. `undefined` means not heard yet.
export type PlayerState = { playing?: boolean; quality?: string }

// YouTube player states: -1 unstarted, 0 ended, 1 playing, 2 paused,
// 3 buffering, 5 cued.
function youtubePlaying(state: unknown) {
  return typeof state === "number" ? state === 1 || state === 3 : undefined
}

function twitchPlaying(params: Record<string, unknown>) {
  if (typeof params.paused === "boolean") {
    return !params.paused
  }

  switch (params.playback) {
    case "Playing":
    case "Buffering":
      return true
    case "Paused":
    case "Ended":
    case "Idle":
      return false
    default:
      return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Reads a message a player posted to the page. Only the two player origins are
 * trusted; anything else, or a shape we don't know, returns null.
 */
export function parsePlayerMessage(origin: string, data: unknown): PlayerState | null {
  if (origin === YOUTUBE_ORIGIN) {
    let parsed: unknown = data
    if (typeof data === "string") {
      try {
        parsed = JSON.parse(data)
      } catch {
        return null
      }
    }

    if (!isRecord(parsed)) {
      return null
    }

    if (parsed.event === "onStateChange") {
      const playing = youtubePlaying(parsed.info)
      return playing === undefined ? null : { playing }
    }

    if ((parsed.event === "infoDelivery" || parsed.event === "initialDelivery") && isRecord(parsed.info)) {
      const playing = youtubePlaying(parsed.info.playerState)
      return playing === undefined ? null : { playing }
    }

    return null
  }

  if (origin === TWITCH_PLAYER_ORIGIN) {
    if (!isRecord(data) || typeof data.namespace !== "string" || !data.namespace.startsWith("twitch-embed")) {
      return null
    }

    if (data.eventName === "play" || data.eventName === "playing") {
      return { playing: true }
    }

    if (data.eventName === "pause" || data.eventName === "ended") {
      return { playing: false }
    }

    if (data.eventName === "UPDATE_STATE" && isRecord(data.params)) {
      const state: PlayerState = {}
      const playing = twitchPlaying(data.params)
      if (playing !== undefined) {
        state.playing = playing
      }
      if (typeof data.params.quality === "string" && data.params.quality) {
        state.quality = data.params.quality
      }
      return state
    }
  }

  return null
}

export function postToPlayer(frame: HTMLIFrameElement | null, command: PlayerMessage | null) {
  if (!frame?.contentWindow || !command) {
    return
  }

  try {
    frame.contentWindow.postMessage(command.message, command.targetOrigin)
  } catch {
    // The frame may have navigated to another origin (an error page, say).
  }
}

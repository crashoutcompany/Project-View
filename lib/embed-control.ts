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

"use client"

import * as React from "react"
import { Volume2, VolumeX } from "lucide-react"

import { ChannelAvatar } from "@/components/channel-avatar"
import { PlatformBadge } from "@/components/platform-badge"
import {
  muteMessage,
  parsePlayerMessage,
  PlayerState,
  postToPlayer,
  qualityMessage,
  youtubeListeningMessage,
  youtubeQualityParam,
} from "@/lib/embed-control"
import { IDLE_SAVER_MEMO, SaverAction, transitionSaver } from "@/lib/fullscreen-saver"
import type { StreamFit, StreamQuality } from "@/lib/settings"
import { twitchPlayerUrl } from "@/lib/twitch-embed"
import { ChannelResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type LiveTileProps = {
  channel: ChannelResult
  activeAudio: boolean
  twitchParents: string[]
  quality?: StreamQuality
  // "fill" crops the player to cover the video area instead of letterboxing.
  fit?: StreamFit
  // Changing this re-sends the mute state even when it didn't change, e.g. to
  // re-mute a player the viewer unmuted by hand before a fullscreen.
  audioSyncKey?: string
  // Set when audio follows focus: called on a tap or click into the player, or
  // from the speaker button.
  onFocusAudio?: (channelId: string) => void
  // Set while another stream is fullscreen and a resource saver applies.
  saverAction?: SaverAction | null
  // The stream the keyboard shortcuts act on, marked with a ring.
  focused?: boolean
  // Hidden under a spotlit stream in fullscreen: still playing, but out of
  // reach for the pointer, Tab and screen readers.
  covered?: boolean
  className?: string
  style?: React.CSSProperties
}

// The strip above each player with the streamer and stream title. The grid
// packs tiles with this in mind, so keep it in sync with the `h-8` below.
export const TILE_HEADER_HEIGHT = 32

// The player identity: a new value means a new iframe load.
function embedTarget(channel: ChannelResult, twitchParents: string[]) {
  if (channel.live.status !== "live") {
    return null
  }

  if (channel.platform === "twitch") {
    return channel.login && twitchParents.length > 0 ? `twitch:${channel.login}` : null
  }

  return channel.live.videoId ? `youtube:${channel.live.videoId}` : null
}

function embedUrl(
  channel: ChannelResult,
  muted: boolean,
  twitchParents: string[],
  quality: StreamQuality
) {
  if (channel.platform === "twitch") {
    return channel.login ? twitchPlayerUrl(channel.login, twitchParents, muted) : null
  }

  if (!channel.live.videoId) {
    return null
  }

  const params = new URLSearchParams({
    autoplay: "1",
    mute: muted ? "1" : "0",
    rel: "0",
    playsinline: "1",
    // Lets us mute and unmute with postMessage instead of reloading.
    enablejsapi: "1",
  })
  const vq = youtubeQualityParam(quality)
  if (vq) {
    params.set("vq", vq)
  }

  return `https://www.youtube.com/embed/${channel.live.videoId}?${params}`
}

// Players load their API a moment after the iframe's load event, so commands
// are repeated a few times after each load.
const COMMAND_RETRY_DELAYS = [0, 1_000, 3_000]

export function LiveTile({
  channel,
  activeAudio,
  twitchParents,
  quality = "auto",
  fit = "fit",
  audioSyncKey,
  onFocusAudio,
  saverAction = null,
  focused = false,
  covered = false,
  className,
  style,
}: LiveTileProps) {
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const target = embedTarget(channel, twitchParents)
  // The URL keeps the mute state from when this player loaded, so later audio
  // changes go through postMessage rather than a reload.
  const [loadedEmbed, setLoadedEmbed] = React.useState({ target, muted: !activeAudio, quality })
  if (loadedEmbed.target !== target) {
    setLoadedEmbed({ target, muted: !activeAudio, quality })
  }
  const src = target ? embedUrl(channel, loadedEmbed.muted, twitchParents, loadedEmbed.quality) : null
  const [loadCount, setLoadCount] = React.useState(0)
  const muted = !activeAudio
  // The saver owns quality while it is active.
  const saverActive = saverAction !== null

  // Read when the timers fire, so the saver turning off doesn't re-send the
  // default quality over the one it just restored.
  const sendPlayerSync = React.useEffectEvent(() => {
    if (channel.platform === "youtube") {
      postToPlayer(frameRef.current, youtubeListeningMessage(channel.channelId))
    }
    postToPlayer(frameRef.current, muteMessage(channel.platform, muted))
    if (!saverActive) {
      postToPlayer(frameRef.current, qualityMessage(channel.platform, quality))
    }
  })
  React.useEffect(() => {
    if (loadCount === 0) {
      return
    }

    const timers = COMMAND_RETRY_DELAYS.map((delay) => window.setTimeout(sendPlayerSync, delay))

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [channel.platform, muted, quality, loadCount, audioSyncKey])

  // What the player reports about itself, so the saver can tell a stream the
  // viewer paused from one it paused, and remember the Twitch quality.
  const playerStateRef = React.useRef<PlayerState>({})
  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) {
        return
      }

      const state = parsePlayerMessage(event.origin, event.data)
      if (state) {
        playerStateRef.current = { ...playerStateRef.current, ...state }
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])
  React.useEffect(() => {
    playerStateRef.current = {}
  }, [src])

  // Fullscreen resource saver. A new load is a fresh player, so the memo of
  // what we changed starts over.
  const saverMemoRef = React.useRef(IDLE_SAVER_MEMO)
  const saverLoadRef = React.useRef(0)
  const runSaver = React.useEffectEvent((action: SaverAction | null) => {
    if (saverLoadRef.current !== loadCount) {
      saverLoadRef.current = loadCount
      saverMemoRef.current = IDLE_SAVER_MEMO
    }

    const { memo, commands } = transitionSaver(saverMemoRef.current, action, {
      platform: channel.platform,
      player: playerStateRef.current,
      requestedQuality: quality,
    })
    saverMemoRef.current = memo
    return commands
  })
  React.useEffect(() => {
    if (loadCount === 0) {
      return
    }

    const commands = runSaver(saverAction)
    if (commands.length === 0) {
      return
    }

    const timers = COMMAND_RETRY_DELAYS.map((delay) =>
      window.setTimeout(() => {
        commands.forEach((command) => postToPlayer(frameRef.current, command))
      }, delay)
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [saverAction, loadCount])

  const focusAudio = onFocusAudio ? () => onFocusAudio(channel.channelId) : undefined

  return (
    <div
      className={cn("group relative flex flex-col bg-black", className)}
      style={style}
      data-channel-id={channel.channelId}
      data-tile=""
      data-focused={focused || undefined}
      inert={covered || undefined}
      aria-hidden={covered || undefined}
    >
      <TileHeader channel={channel} />
      {/* A size container, so a filled player can size itself from it. */}
      <div className="relative min-h-0 flex-1 overflow-hidden [container-type:size]">
        {src ? (
          <iframe
            ref={frameRef}
            className={
              fit === "fill"
                ? // Covers the area at 16:9 and crops the overflow, like
                  // object-fit: cover.
                  "absolute top-1/2 left-1/2 h-[max(100cqh,calc(100cqw*9/16))] w-[max(100cqw,calc(100cqh*16/9))] max-w-none -translate-x-1/2 -translate-y-1/2"
                : "size-full"
            }
            src={src}
            title={`${channel.title} live stream`}
            data-channel-id={channel.channelId}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => setLoadCount((count) => count + 1)}
            // A tap inside a cross-origin player only reaches us as focus.
            onFocus={focusAudio}
          />
        ) : (
          // The tile is always dark, so text uses fixed light tones, not theme colors.
          <div className="flex size-full items-center justify-center bg-[#0a0a0f] p-4">
            <div className="flex flex-col items-center gap-3 text-center">
              <ChannelAvatar
                title={channel.title}
                thumbnailUrl={channel.thumbnailUrl}
                size="default"
                className="size-14 opacity-80"
              />
              {/* The name is in the header strip above. */}
              <p className="text-xs font-medium tracking-wide text-white/50 uppercase">
                {channel.live.status === "unknown" ? "Status unknown" : "Offline"}
              </p>
            </div>
          </div>
        )}
        {focusAudio && src ? (
          <button
            type="button"
            onClick={focusAudio}
            aria-label={activeAudio ? `${channel.title} is playing audio` : `Play audio from ${channel.title}`}
            aria-pressed={activeAudio}
            className="absolute top-2 right-2 flex size-8 items-center justify-center bg-black/60 text-white/85 backdrop-blur-sm transition-opacity duration-150 ease-out pointer-coarse:size-11 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100"
          >
            {activeAudio ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        ) : null}
      </div>
      {focused ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-2 ring-primary/70 ring-inset"
        />
      ) : null}
    </div>
  )
}

// Streamer, stream title and platform, in the strip that would otherwise be
// letterbox bars. Fixed light tones, like the rest of the always-dark tile.
function TileHeader({ channel }: { channel: ChannelResult }) {
  const streamTitle = channel.live.status === "live" ? channel.live.title : undefined

  return (
    <div className="flex h-8 shrink-0 items-center gap-2 bg-[#0a0a0f] px-2 text-xs">
      <ChannelAvatar
        title={channel.title}
        thumbnailUrl={channel.thumbnailUrl}
        size="sm"
        className="size-5"
      />
      <span className="max-w-[45%] shrink-0 truncate font-medium text-white/90">
        {channel.title}
      </span>
      <span className="min-w-0 flex-1 truncate text-white/55" title={streamTitle}>
        {streamTitle}
      </span>
      <PlatformBadge platform={channel.platform} />
    </div>
  )
}

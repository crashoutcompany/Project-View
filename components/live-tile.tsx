"use client"

import * as React from "react"
import { Volume2, VolumeX } from "lucide-react"

import { ChannelAvatar } from "@/components/channel-avatar"
import { PlatformBadge } from "@/components/platform-badge"
import { muteMessage, postToPlayer, qualityMessage, youtubeQualityParam } from "@/lib/embed-control"
import type { StreamQuality } from "@/lib/settings"
import { twitchPlayerUrl } from "@/lib/twitch-embed"
import { ChannelResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type LiveTileProps = {
  channel: ChannelResult
  activeAudio: boolean
  twitchParents: string[]
  quality?: StreamQuality
  // Changing this re-sends the mute state even when it didn't change, e.g. to
  // re-mute a player the viewer unmuted by hand before a fullscreen.
  audioSyncKey?: string
  // Set when audio follows focus: called on hover, tap or the speaker button.
  onFocusAudio?: (channelId: string) => void
  className?: string
  style?: React.CSSProperties
}

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
  audioSyncKey,
  onFocusAudio,
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

  React.useEffect(() => {
    if (loadCount === 0) {
      return
    }

    const timers = COMMAND_RETRY_DELAYS.map((delay) =>
      window.setTimeout(() => {
        postToPlayer(frameRef.current, muteMessage(channel.platform, muted))
        postToPlayer(frameRef.current, qualityMessage(channel.platform, quality))
      }, delay)
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [channel.platform, muted, quality, loadCount, audioSyncKey])

  const focusAudio = onFocusAudio ? () => onFocusAudio(channel.channelId) : undefined

  return (
    <div
      className={cn("group relative flex flex-col bg-black", className)}
      style={style}
      data-channel-id={channel.channelId}
      onPointerEnter={
        focusAudio
          ? (event) => {
              if (event.pointerType === "mouse") {
                focusAudio()
              }
            }
          : undefined
      }
    >
      {/* Video area fills all space */}
      <div className="flex-1">
        {src ? (
          <iframe
            ref={frameRef}
            className="size-full"
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
              <div className="space-y-1">
                <p className="text-sm font-medium text-white/85">
                  {channel.title}
                </p>
                <p className="text-xs font-medium tracking-wide text-white/50 uppercase">
                  {channel.live.status === "unknown" ? "Status unknown" : "Offline"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Fades on hover so it never covers the player's own controls. */}
      <PlatformBadge
        platform={channel.platform}
        showLabel
        className="pointer-events-none absolute top-2 left-2 transition-opacity duration-150 ease-out group-hover:opacity-0"
      />
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
  )
}

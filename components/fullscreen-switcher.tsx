"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { ChannelResult } from "@/lib/types"
import { cn } from "@/lib/utils"

// How long the stream name stays up after each switch.
export const SWITCHER_LABEL_MS = 2_500

type FullscreenSwitcherProps = {
  channels: ChannelResult[]
  channelId: string
  onStep: (delta: 1 | -1) => void
}

const ARROW_CLASS =
  "pointer-events-auto absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center bg-black/60 text-white/90 opacity-70 backdrop-blur-sm transition-opacity duration-150 ease-out hover:opacity-100 focus-visible:opacity-100 pointer-coarse:size-12"

/**
 * Previous and next arrows over a spotlit fullscreen stream, plus its name for
 * a moment after each switch. Pointer moves over a player never reach the
 * page, so the arrows can't wait for hover to appear; they stay half-dimmed instead.
 */
export function FullscreenSwitcher({ channels, channelId, onStep }: FullscreenSwitcherProps) {
  const [labelHiddenFor, setLabelHiddenFor] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timeout = window.setTimeout(() => setLabelHiddenFor(channelId), SWITCHER_LABEL_MS)
    return () => window.clearTimeout(timeout)
  }, [channelId])

  const index = channels.findIndex((channel) => channel.channelId === channelId)
  const channel = channels[index]
  if (!channel || channels.length < 2) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      <p
        aria-live="polite"
        // Below the tile's header strip.
        className={cn(
          "absolute top-11 left-1/2 max-w-[calc(100%-8rem)] -translate-x-1/2 truncate bg-black/60 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm transition-opacity duration-300 ease-out",
          labelHiddenFor === channelId && "opacity-0"
        )}
      >
        <span className="text-white/60 tabular-nums">
          {index + 1} / {channels.length}
        </span>{" "}
        · {channel.title}
      </p>
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label="Previous stream"
        className={cn(ARROW_CLASS, "left-3")}
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label="Next stream"
        className={cn(ARROW_CLASS, "right-3")}
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}

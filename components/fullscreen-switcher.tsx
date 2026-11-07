"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { ChannelResult } from "@/lib/types"
import { cn } from "@/lib/utils"

// How long the stream name stays up after each switch.
export const SWITCHER_LABEL_MS = 2_500
// How long an arrow stays up after the pointer stops moving in its zone.
export const ARROW_IDLE_MS = 1_500

type FullscreenSwitcherProps = {
  channels: ChannelResult[]
  channelId: string
  onStep: (delta: 1 | -1) => void
}

// The button is a wider, invisible hover zone at the screen edge, so the
// arrow inside is easy to find without being on screen all the time.
const ARROW_ZONE_CLASS =
  "group/arrow pointer-events-auto absolute top-1/2 flex h-40 w-16 -translate-y-1/2 items-center justify-center outline-none"

// Hidden for a mouse until it points at the zone or keyboard focus lands on
// it. Touch has no hover, so it stays visible there.
const ARROW_CLASS =
  "flex size-10 items-center justify-center bg-black/60 text-white/90 opacity-70 backdrop-blur-sm transition-opacity duration-150 ease-out pointer-fine:opacity-0 group-data-[pointing]/arrow:opacity-100 group-focus-visible/arrow:opacity-100 group-focus-visible/arrow:ring-2 group-focus-visible/arrow:ring-white/70 pointer-coarse:size-12"

type ArrowButtonProps = {
  direction: "previous" | "next"
  onClick: () => void
}

/**
 * Shown while the pointer moves in the zone, not by CSS :hover. A pointer that
 * leaves straight into a cross-origin player may never tell the page it left,
 * which would leave :hover stuck on, so the arrow also fades once the pointer
 * goes still.
 */
function ArrowButton({ direction, onClick }: ArrowButtonProps) {
  const [pointing, setPointing] = React.useState(false)
  const idleRef = React.useRef<number | null>(null)

  function stopPointing() {
    if (idleRef.current !== null) {
      window.clearTimeout(idleRef.current)
      idleRef.current = null
    }
    setPointing(false)
  }

  function onPointerMove(event: React.PointerEvent) {
    if (event.pointerType !== "mouse") {
      return
    }

    setPointing(true)
    if (idleRef.current !== null) {
      window.clearTimeout(idleRef.current)
    }
    idleRef.current = window.setTimeout(stopPointing, ARROW_IDLE_MS)
  }

  React.useEffect(
    () => () => {
      if (idleRef.current !== null) {
        window.clearTimeout(idleRef.current)
      }
    },
    []
  )

  const Icon = direction === "previous" ? ChevronLeft : ChevronRight

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerMove={onPointerMove}
      onPointerLeave={stopPointing}
      aria-label={direction === "previous" ? "Previous stream" : "Next stream"}
      data-pointing={pointing || undefined}
      className={cn(ARROW_ZONE_CLASS, direction === "previous" ? "left-0" : "right-0")}
    >
      <span className={ARROW_CLASS}>
        <Icon className="size-5" />
      </span>
    </button>
  )
}

/**
 * Previous and next arrows over a spotlit fullscreen stream, plus its name for
 * a moment after each switch. The arrows show when pointed at or focused.
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
      <ArrowButton direction="previous" onClick={() => onStep(-1)} />
      <ArrowButton direction="next" onClick={() => onStep(1)} />
    </div>
  )
}

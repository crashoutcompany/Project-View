import { Eye } from "lucide-react"

import { formatUptime, formatViewerCount, isLive } from "@/lib/live"
import { LiveStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type LiveBadgeProps = {
  live: LiveStatus
  // Passed in rather than read during render so server and client agree.
  now: number
  className?: string
}

export function LiveBadge({ live, now, className }: LiveBadgeProps) {
  if (!isLive(live)) {
    return null
  }

  const viewers = formatViewerCount(live.viewerCount)
  const uptime = formatUptime(live.startedAt, now)

  return (
    <span
      data-slot="live-badge"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-[11px] leading-none whitespace-nowrap text-muted-foreground tabular-nums",
        className,
      )}
    >
      <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-red-600/85 px-1.5 text-[9px] leading-none font-bold tracking-wide text-white uppercase">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
        Live
      </span>
      {viewers ? (
        <span className="inline-flex items-center gap-1" title={`${live.viewerCount} watching`}>
          <Eye aria-hidden className="size-3" />
          {viewers}
          <span className="sr-only"> watching</span>
        </span>
      ) : null}
      {uptime ? <span>live {uptime}</span> : null}
    </span>
  )
}

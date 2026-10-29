import { formatUptime, isLive } from "@/lib/live"
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
      {uptime ? <span>live {uptime}</span> : null}
    </span>
  )
}

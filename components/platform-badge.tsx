import { Platform } from "@/lib/types"
import { cn } from "@/lib/utils"

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
}

function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === "twitch") {
    return (
      <svg aria-hidden viewBox="0 0 24 24" className={cn("text-[#9146FF]", className)}>
        <path
          fill="currentColor"
          d="M4.3 2 2.5 6.6v13.9h5V23h2.8l2.5-2.5h3.9l5.3-5.3V2H4.3Zm15.6 12.3-3.1 3.1h-4.9l-2.5 2.5v-2.5H5.4V3.9h14.5v10.4Z"
        />
        <path fill="currentColor" d="M16.3 6.9h-1.9v5.4h1.9V6.9Zm-5.3 0H9.1v5.4H11V6.9Z" />
      </svg>
    )
  }

  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("text-[#FF0033]", className)}>
      <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="currentColor" />
      <path fill="#fff" d="M10 8.8v6.4l5.6-3.2L10 8.8Z" />
    </svg>
  )
}

type PlatformBadgeProps = {
  platform: Platform
  // Glyph only (rows) or glyph plus name (tiles).
  showLabel?: boolean
  className?: string
}

export function PlatformBadge({ platform, showLabel = false, className }: PlatformBadgeProps) {
  const label = PLATFORM_LABELS[platform]

  if (!showLabel) {
    return (
      <span
        data-slot="platform-badge"
        data-platform={platform}
        title={label}
        className={cn("inline-flex shrink-0 items-center", className)}
      >
        <PlatformGlyph platform={platform} className="size-3.5" />
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <span
      data-slot="platform-badge"
      data-platform={platform}
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-black/60 px-1.5 text-[10px] leading-none font-medium text-white/85 backdrop-blur-sm",
        className,
      )}
    >
      <PlatformGlyph platform={platform} className="size-3" />
      {label}
    </span>
  )
}

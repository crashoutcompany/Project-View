import { PLATFORM_LABELS } from "@/components/platform-badge"
import { Platform, PlatformFilter as PlatformFilterValue } from "@/lib/types"
import { cn } from "@/lib/utils"

type PlatformFilterProps = {
  platforms: Platform[]
  value: PlatformFilterValue
  onChange: (value: PlatformFilterValue) => void
}

// Segmented control; only useful when more than one platform is configured.
export function PlatformFilter({ platforms, value, onChange }: PlatformFilterProps) {
  if (platforms.length < 2) {
    return null
  }

  const options: PlatformFilterValue[] = ["all", ...platforms]

  return (
    <div
      role="group"
      aria-label="Filter by platform"
      className="flex h-8 items-stretch gap-0.5 rounded-md border border-border/60 p-0.5 text-xs pointer-coarse:h-11"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            "flex-1 rounded-sm px-2 font-medium text-muted-foreground transition-[background-color,color,scale] duration-[120ms] ease-out hover:text-foreground active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            value === option && "bg-muted text-foreground"
          )}
        >
          {option === "all" ? "All" : PLATFORM_LABELS[option]}
        </button>
      ))}
    </div>
  )
}

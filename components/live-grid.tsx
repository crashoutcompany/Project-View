import { RadioTower } from "lucide-react"

import { LiveTile } from "@/components/live-tile"
import { ChannelResult } from "@/lib/types"

type LiveGridProps = {
  channels: ChannelResult[]
  activeAudioChannelId: string | null
  onMakeActive: (channelId: string) => void
}

function getGridClass(count: number) {
  if (count <= 1) {
    return "grid-cols-1"
  }

  if (count === 2) {
    return "grid-cols-1 xl:grid-cols-2"
  }

  return "grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3"
}

export function LiveGrid({
  channels,
  activeAudioChannelId,
  onMakeActive,
}: LiveGridProps) {
  if (channels.length === 0) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center border border-dashed border-border/70 bg-card/40 px-6 text-center">
        <div className="space-y-3 text-sm text-muted-foreground">
          <RadioTower className="mx-auto size-6" />
          <p>Choose a channel from the combobox to start building your live wall.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`grid gap-4 ${getGridClass(channels.length)}`}>
      {channels.map((channel) => (
        <LiveTile
          key={channel.channelId}
          channel={channel}
          activeAudio={activeAudioChannelId === channel.channelId}
          onMakeActive={onMakeActive}
        />
      ))}
    </div>
  )
}

import { CircleOff, Volume2, VolumeX } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ChannelResult } from "@/lib/types"

type LiveTileProps = {
  channel: ChannelResult
  activeAudio: boolean
  onMakeActive: (channelId: string) => void
}

export function LiveTile({
  channel,
  activeAudio,
  onMakeActive,
}: LiveTileProps) {
  const isLive = channel.live.status === "live" && channel.live.videoId

  return (
    <Card className="h-full border-border/70 bg-card/80 backdrop-blur-sm">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{channel.title}</CardTitle>
            <CardDescription className="truncate">
              {channel.live.title || "Waiting for this channel to go live."}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isLive ? "default" : "secondary"}
              className="uppercase tracking-wide"
            >
              {isLive ? "live" : "offline"}
            </Badge>
            <Button
              variant={activeAudio ? "default" : "outline"}
              size="sm"
              onClick={() => onMakeActive(channel.channelId)}
            >
              {activeAudio ? <Volume2 /> : <VolumeX />}
              {activeAudio ? "Audio on" : "Focus audio"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLive ? (
          <div className="aspect-video border-t border-border/60 bg-black">
            <iframe
              className="size-full"
              src={`https://www.youtube.com/embed/${channel.live.videoId}?autoplay=1&mute=${
                activeAudio ? "0" : "1"
              }&rel=0&playsinline=1`}
              title={`${channel.title} live stream`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center bg-muted/30">
            <div className="space-y-2 text-center text-xs text-muted-foreground">
              <CircleOff className="mx-auto size-5" />
              <p>This channel is currently offline.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export type LiveState = "live" | "offline" | "unknown"

export type BaseChannel = {
  channelId: string
  title: string
  description: string
  thumbnailUrl: string
}

export type LiveStatus = {
  status: LiveState
  checkedAt: string
  videoId?: string
  title?: string
  thumbnailUrl?: string
  // Optional because not every provider reports them on the live check.
  startedAt?: string
  viewerCount?: number
}

export type ChannelResult = BaseChannel & {
  live: LiveStatus
}

export type SearchPayload = {
  query: string
  channels: ChannelResult[]
  cached: boolean
  source: "seed" | "search"
}

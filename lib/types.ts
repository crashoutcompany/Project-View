export type LiveState = "live" | "offline" | "unknown"

export type Platform = "youtube" | "twitch"

export type PlatformFilter = Platform | "all"

export type BaseChannel = {
  platform: Platform
  // YouTube ids are bare ("UC..."); Twitch ids carry a "tw:" prefix
  // ("tw:<user id>") so both share one URL list and cache namespace.
  channelId: string
  // Twitch login, needed by the player embed. Unset for YouTube.
  login?: string
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

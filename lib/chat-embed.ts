import { TWITCH_PROD_PARENT, twitchChatUrl, twitchParentHosts, toHostname } from "@/lib/twitch-embed"
import { ChannelResult } from "@/lib/types"

// Official chat embeds only: no API calls, no OAuth. Typing works when the
// viewer is already signed in to Twitch or YouTube in this browser; otherwise
// the embed is read-only.

export function youtubeChatUrl(videoId: string, embedDomain: string) {
  const params = new URLSearchParams({ v: videoId, embed_domain: embedDomain })

  return `https://www.youtube.com/live_chat?${params}`
}

type ChatEmbedOptions = {
  // Server-derived hosts (request host and Vercel URLs).
  twitchParents: string[]
  // window.location.hostname of the embedding page.
  hostname: string
  dark: boolean
}

/** Chat iframe URL, or null when the channel has no chat to show. */
export function chatEmbedUrl(channel: ChannelResult, { twitchParents, hostname, dark }: ChatEmbedOptions) {
  if (channel.live.status !== "live") {
    return null
  }

  if (channel.platform === "twitch") {
    return channel.login
      ? twitchChatUrl(channel.login, twitchParentHosts([TWITCH_PROD_PARENT, hostname, ...twitchParents]), dark)
      : null
  }

  const embedDomain = toHostname(hostname)

  return channel.live.videoId && embedDomain ? youtubeChatUrl(channel.live.videoId, embedDomain) : null
}

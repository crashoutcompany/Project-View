"use server"

import { checkBotId } from "botid/server"

import { ChannelResult, SearchPayload } from "@/lib/types"
import {
  getSearchResults,
  projectConfigured,
  refreshChannelLiveStatus,
} from "@/lib/search-service"

export async function searchChannelsAction(query: string): Promise<SearchPayload> {
  const verification = await checkBotId()

  if (verification.isBot) {
    throw new Error("Access denied")
  }

  if (!projectConfigured()) {
    return {
      query,
      channels: [],
      cached: false,
      source: "search",
    }
  }

  return getSearchResults(query)
}

export async function refreshSelectedChannelsAction(
  channelIds: string[]
): Promise<ChannelResult[]> {
  const verification = await checkBotId()

  if (verification.isBot) {
    throw new Error("Access denied")
  }

  if (!projectConfigured()) {
    return []
  }

  const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)))
  const channels = await Promise.all(
    uniqueIds.map((channelId) => refreshChannelLiveStatus(channelId))
  )

  return channels.filter((channel): channel is ChannelResult => Boolean(channel))
}

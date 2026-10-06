"use server"

import { checkBotId } from "botid/server"

import { isValidChannelId, MAX_QUERY_LENGTH, MAX_SELECTED_CHANNELS } from "@/lib/cache-keys"
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

  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) {
    throw new Error("Invalid query")
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

  if (!Array.isArray(channelIds)) {
    throw new Error("Invalid channel ids")
  }

  if (!projectConfigured()) {
    return []
  }

  const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)))
  if (uniqueIds.length > MAX_SELECTED_CHANNELS) {
    throw new Error("Too many channels")
  }
  if (!uniqueIds.every(isValidChannelId)) {
    throw new Error("Invalid channel ids")
  }
  const channels = await Promise.all(
    uniqueIds.map((channelId) => refreshChannelLiveStatus(channelId))
  )

  return channels.filter((channel): channel is ChannelResult => Boolean(channel))
}

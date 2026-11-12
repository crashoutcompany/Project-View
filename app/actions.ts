"use server"

import { checkBotId } from "botid/server"
import { headers } from "next/headers"

import { MAX_QUERY_LENGTH, MAX_SELECTED_CHANNELS, parseChannelId } from "@/lib/cache-keys"
import { isRateLimited, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit"
import { ChannelResult, PlatformFilter, SearchPayload } from "@/lib/types"
import {
  getSearchResults,
  projectConfigured,
  refreshChannelLiveStatus,
} from "@/lib/search-service"

const PLATFORM_FILTERS: readonly PlatformFilter[] = ["all", "youtube", "twitch"]

export async function searchChannelsAction(
  query: string,
  platform: PlatformFilter = "all"
): Promise<SearchPayload> {
  const verification = await checkBotId()

  if (verification.isBot) {
    throw new Error("Access denied")
  }

  if (typeof query !== "string" || query.length > MAX_QUERY_LENGTH) {
    throw new Error("Invalid query")
  }

  if (!PLATFORM_FILTERS.includes(platform)) {
    throw new Error("Invalid platform")
  }

  if (!projectConfigured()) {
    return {
      query,
      channels: [],
      cached: false,
      source: "search",
    }
  }

  // Over the limit: cached results only, with a message instead of an error.
  if (await isRateLimited(await headers())) {
    const payload = await getSearchResults(query, platform, true)
    return { ...payload, notice: RATE_LIMITED_MESSAGE }
  }

  return getSearchResults(query, platform)
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

  const parsedIds = Array.from(new Set(channelIds.filter(Boolean))).map(parseChannelId)
  if (parsedIds.length > MAX_SELECTED_CHANNELS) {
    throw new Error("Too many channels")
  }
  if (!parsedIds.every((parsed) => parsed !== null)) {
    throw new Error("Invalid channel ids")
  }
  const uniqueIds = Array.from(new Set(parsedIds.map((parsed) => parsed.channelId)))
  const cachedOnly = await isRateLimited(await headers())
  const channels = await Promise.all(
    uniqueIds.map((channelId) => refreshChannelLiveStatus(channelId, cachedOnly))
  )

  return channels.filter((channel): channel is ChannelResult => Boolean(channel))
}

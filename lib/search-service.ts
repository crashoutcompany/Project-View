import "server-only"

import {
  channelCacheKey,
  CHANNEL_CACHE_TTL_SECONDS,
  liveCacheKey,
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  normalizeQuery,
  SEARCH_CACHE_TTL_SECONDS,
  searchCacheKey,
  SEARCH_RESULT_LIMIT,
  seedCacheKey,
  SEEDED_CHANNEL_LIMIT,
  SEED_CACHE_TTL_SECONDS,
} from "@/lib/cache-keys"
import { hasRedisEnv } from "@/lib/env"
import { getRedis } from "@/lib/redis"
import { BaseChannel, ChannelResult, LiveStatus, SearchPayload } from "@/lib/types"
import {
  getChannelsByIds,
  getLiveVideoForChannel,
  searchChannels,
  youtubeConfigured,
} from "@/lib/youtube"

async function readCache<T>(key: string) {
  const redis = getRedis()
  if (!redis) {
    return null
  }

  return (await redis.get<T>(key)) ?? null
}

async function writeCache<T>(key: string, value: T, ttlSeconds: number) {
  const redis = getRedis()
  if (!redis) {
    return
  }

  await redis.set(key, value, { ex: ttlSeconds })
}

function dedupeChannels(channels: BaseChannel[]) {
  return Array.from(new Map(channels.map((channel) => [channel.channelId, channel])).values())
}

async function cacheChannels(channels: BaseChannel[]) {
  await Promise.all(
    channels.map((channel) =>
      writeCache(channelCacheKey(channel.channelId), channel, CHANNEL_CACHE_TTL_SECONDS)
    )
  )
}

async function getChannelById(channelId: string) {
  const cached = await readCache<BaseChannel>(channelCacheKey(channelId))
  if (cached) {
    return cached
  }

  const channels = await getChannelsByIds([channelId])
  const channel = channels[0] ?? null

  if (channel) {
    await writeCache(channelCacheKey(channelId), channel, CHANNEL_CACHE_TTL_SECONDS)
  }

  return channel
}

async function getLiveStatus(channelId: string) {
  const cached = await readCache<LiveStatus>(liveCacheKey(channelId))
  if (cached) {
    return cached
  }

  const live = await getLiveVideoForChannel(channelId)
  const ttl =
    live.status === "live"
      ? LIVE_CACHE_TTL_LIVE_SECONDS
      : LIVE_CACHE_TTL_OFFLINE_SECONDS

  await writeCache(liveCacheKey(channelId), live, ttl)

  return live
}

async function updateSeedChannels(channels: BaseChannel[]) {
  const current = (await readCache<BaseChannel[]>(seedCacheKey)) ?? []
  const merged = dedupeChannels([...channels, ...current]).slice(0, SEEDED_CHANNEL_LIMIT)

  await writeCache(seedCacheKey, merged, SEED_CACHE_TTL_SECONDS)
}

async function withLiveStatus(channels: BaseChannel[]) {
  const liveStates = await Promise.all(
    channels.map(async (channel) => {
      const live = await getLiveStatus(channel.channelId)

      return {
        ...channel,
        live,
      } satisfies ChannelResult
    })
  )

  return liveStates
}

export function projectConfigured() {
  return youtubeConfigured() && hasRedisEnv()
}

export async function getSeedResults(): Promise<SearchPayload> {
  if (!projectConfigured()) {
    return {
      query: "",
      channels: [],
      cached: false,
      source: "seed",
    }
  }

  const channels = (await readCache<BaseChannel[]>(seedCacheKey)) ?? []
  const merged = await withLiveStatus(channels)

  return {
    query: "",
    channels: merged,
    cached: true,
    source: "seed",
  }
}

export async function getSearchResults(query: string): Promise<SearchPayload> {
  const normalizedQuery = normalizeQuery(query)

  if (!projectConfigured()) {
    return {
      query: normalizedQuery,
      channels: [],
      cached: false,
      source: "search",
    }
  }

  if (!normalizedQuery) {
    return getSeedResults()
  }

  const cachedChannels = await readCache<BaseChannel[]>(searchCacheKey(normalizedQuery))
  const channels =
    cachedChannels ??
    (await searchChannels(normalizedQuery, SEARCH_RESULT_LIMIT)).slice(
      0,
      SEARCH_RESULT_LIMIT
    )

  if (!cachedChannels) {
    await writeCache(
      searchCacheKey(normalizedQuery),
      channels,
      SEARCH_CACHE_TTL_SECONDS
    )
    await cacheChannels(channels)
  }

  await updateSeedChannels(channels)

  return {
    query: normalizedQuery,
    channels: await withLiveStatus(channels),
    cached: Boolean(cachedChannels),
    source: "search",
  }
}

export async function getSelectedChannels(channelIds: string[]) {
  if (!projectConfigured()) {
    return []
  }

  const uniqueIds = Array.from(new Set(channelIds.filter(Boolean)))
  const channels = await Promise.all(uniqueIds.map((channelId) => getChannelById(channelId)))

  return withLiveStatus(channels.filter((channel): channel is BaseChannel => Boolean(channel)))
}

export async function refreshChannelLiveStatus(channelId: string) {
  if (!projectConfigured()) {
    return null
  }

  const channel = await getChannelById(channelId)

  if (!channel) {
    return null
  }

  const live = await getLiveVideoForChannel(channelId)
  const ttl =
    live.status === "live"
      ? LIVE_CACHE_TTL_LIVE_SECONDS
      : LIVE_CACHE_TTL_OFFLINE_SECONDS

  await writeCache(liveCacheKey(channelId), live, ttl)

  return {
    ...channel,
    live,
  } satisfies ChannelResult
}

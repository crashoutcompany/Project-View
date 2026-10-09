import "server-only"

import {
  channelCacheKey,
  CHANNEL_CACHE_TTL_SECONDS,
  liveCacheKey,
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  normalizeQuery,
  sanitizeChannelIds,
  SEARCH_CACHE_TTL_SECONDS,
  searchCacheKey,
  SEARCH_RESULT_LIMIT,
  seedCacheKey,
  SEEDED_CHANNEL_LIMIT,
  SEED_CACHE_TTL_SECONDS,
} from "@/lib/cache-keys"
import { readCache, writeCache } from "@/lib/cache"
import { BaseChannel, ChannelResult, LiveStatus, SearchPayload } from "@/lib/types"
import {
  getChannelsByIds,
  getLiveVideoForChannel,
  searchChannels,
  youtubeConfigured,
} from "@/lib/youtube"

let warnedYouTubeUnavailable = false

// YouTube errors (quota, bad key, outage, timeout) degrade the result instead
// of failing the page or action. Fallbacks are never cached.
async function callYouTube<T>(call: () => Promise<T>) {
  try {
    const value = await call()
    if (warnedYouTubeUnavailable) {
      warnedYouTubeUnavailable = false
      console.info("[youtube] YouTube API reachable again.")
    }
    return { ok: true as const, value }
  } catch (error) {
    if (!warnedYouTubeUnavailable) {
      warnedYouTubeUnavailable = true
      console.warn("[youtube] YouTube API call failed; serving degraded results.", error)
    }
    return { ok: false as const }
  }
}

export function resetYouTubeStateForTests() {
  warnedYouTubeUnavailable = false
}

function unknownLiveStatus(): LiveStatus {
  return { status: "unknown", checkedAt: new Date().toISOString() }
}

// Keeps a selected channel on screen (and in the URL) while its details
// can't be fetched, rather than dropping it from the user's selection.
function placeholderChannel(channelId: string): BaseChannel {
  return { channelId, title: channelId, description: "", thumbnailUrl: "" }
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

  const response = await callYouTube(() => getChannelsByIds([channelId]))
  if (!response.ok) {
    return placeholderChannel(channelId)
  }

  const channel = response.value[0] ?? null

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

  return fetchLiveStatus(channelId)
}

async function fetchLiveStatus(channelId: string) {
  const response = await callYouTube(() => getLiveVideoForChannel(channelId))
  if (!response.ok) {
    return unknownLiveStatus()
  }

  const live = response.value
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

// Redis is optional: without it every request goes straight to the YouTube API.
export function projectConfigured() {
  return youtubeConfigured()
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
  let channels = cachedChannels

  if (!channels) {
    const response = await callYouTube(() =>
      searchChannels(normalizedQuery, SEARCH_RESULT_LIMIT)
    )
    if (!response.ok) {
      return { query: normalizedQuery, channels: [], cached: false, source: "search" }
    }

    channels = response.value.slice(0, SEARCH_RESULT_LIMIT)

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

  const uniqueIds = sanitizeChannelIds(channelIds)
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

  return {
    ...channel,
    live: await fetchLiveStatus(channelId),
  } satisfies ChannelResult
}

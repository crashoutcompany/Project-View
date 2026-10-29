import "server-only"

import {
  channelCacheKey,
  CHANNEL_CACHE_TTL_SECONDS,
  liveCacheKey,
  LIVE_CACHE_TTL_LIVE_SECONDS,
  LIVE_CACHE_TTL_OFFLINE_SECONDS,
  normalizeQuery,
  parseChannelId,
  platformOf,
  sanitizeChannelIds,
  SEARCH_CACHE_TTL_SECONDS,
  searchCacheKey,
  SEARCH_RESULT_LIMIT,
  seedCacheKey,
  SEEDED_CHANNEL_LIMIT,
  SEED_CACHE_TTL_SECONDS,
} from "@/lib/cache-keys"
import { createBatcher } from "@/lib/batcher"
import { readCache, writeCache } from "@/lib/cache"
import {
  getStreamsByUserIds,
  getUsersByIds,
  HELIX_MAX_IDS,
  searchChannels as searchTwitchChannels,
  twitchConfigured,
} from "@/lib/twitch"
import {
  BaseChannel,
  ChannelResult,
  LiveStatus,
  Platform,
  PlatformFilter,
  SearchPayload,
} from "@/lib/types"
import {
  getChannelsByIds,
  getLiveVideoForChannel,
  searchChannels,
  youtubeConfigured,
} from "@/lib/youtube"

let warnedYouTubeUnavailable = false
let warnedTwitchUnavailable = false

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

// Mirrors callYouTube: Twitch errors (bad credentials, outage, timeout) only
// degrade Twitch results, never YouTube ones, and fallbacks are never cached.
async function callTwitch<T>(call: () => Promise<T>) {
  try {
    const value = await call()
    if (warnedTwitchUnavailable) {
      warnedTwitchUnavailable = false
      console.info("[twitch] Twitch API reachable again.")
    }
    return { ok: true as const, value }
  } catch (error) {
    if (!warnedTwitchUnavailable) {
      warnedTwitchUnavailable = true
      console.warn("[twitch] Twitch API call failed; serving degraded results.", error)
    }
    return { ok: false as const }
  }
}

export function resetTwitchStateForTests() {
  warnedTwitchUnavailable = false
}

// Every Twitch lookup on a page load or refresh shares one /users and one
// /streams call (Helix takes up to 100 ids each).
const twitchUsers = createBatcher(async (userIds) => {
  const response = await callTwitch(() => getUsersByIds(userIds))
  return response.ok ? response.value : null
}, HELIX_MAX_IDS)

const twitchStreams = createBatcher(async (userIds) => {
  const response = await callTwitch(() => getStreamsByUserIds(userIds))
  return response.ok ? response.value : null
}, HELIX_MAX_IDS)

function platformConfigured(platform: Platform) {
  return platform === "twitch" ? twitchConfigured() : youtubeConfigured()
}

export function configuredPlatforms(): Platform[] {
  return (["youtube", "twitch"] as const).filter(platformConfigured)
}

function twitchUserId(channelId: string) {
  return parseChannelId(channelId)?.id ?? channelId
}

// Channels cached before Twitch support have no platform field.
function withPlatform(channel: BaseChannel): BaseChannel {
  return channel.platform ? channel : { ...channel, platform: platformOf(channel.channelId) }
}

function unknownLiveStatus(): LiveStatus {
  return { status: "unknown", checkedAt: new Date().toISOString() }
}

// Keeps a selected channel on screen (and in the URL) while its details
// can't be fetched, rather than dropping it from the user's selection.
function placeholderChannel(channelId: string): BaseChannel {
  return {
    platform: platformOf(channelId),
    channelId,
    title: channelId,
    description: "",
    thumbnailUrl: "",
  }
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
    return withPlatform(cached)
  }

  const platform = platformOf(channelId)
  if (!platformConfigured(platform)) {
    return placeholderChannel(channelId)
  }

  const response =
    platform === "twitch"
      ? await twitchUsers.load(twitchUserId(channelId))
      : await callYouTube(async () => (await getChannelsByIds([channelId]))[0])
  if (!response.ok) {
    return placeholderChannel(channelId)
  }

  const channel = response.value ?? null

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
  const platform = platformOf(channelId)
  if (!platformConfigured(platform)) {
    return unknownLiveStatus()
  }

  const response =
    platform === "twitch"
      ? await twitchStreams.load(twitchUserId(channelId))
      : await callYouTube(() => getLiveVideoForChannel(channelId))
  if (!response.ok || !response.value) {
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

// Redis is optional: without it every request goes straight to the provider
// APIs. Either provider on its own is enough to use the app.
export function projectConfigured() {
  return youtubeConfigured() || twitchConfigured()
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

  const channels = ((await readCache<BaseChannel[]>(seedCacheKey)) ?? []).map(withPlatform)
  const merged = await withLiveStatus(channels)

  return {
    query: "",
    channels: merged,
    cached: true,
    source: "seed",
  }
}

async function searchPlatform(platform: Platform, query: string) {
  const key = searchCacheKey(query, platform)
  const cached = await readCache<BaseChannel[]>(key)
  if (cached) {
    return { channels: cached.map(withPlatform), cached: true }
  }

  const response =
    platform === "twitch"
      ? await callTwitch(() => searchTwitchChannels(query, SEARCH_RESULT_LIMIT))
      : await callYouTube(() => searchChannels(query, SEARCH_RESULT_LIMIT))
  if (!response.ok) {
    return null
  }

  const channels = response.value.slice(0, SEARCH_RESULT_LIMIT)

  await writeCache(key, channels, SEARCH_CACHE_TTL_SECONDS)
  await cacheChannels(channels)

  return { channels, cached: false }
}

// Alternates platforms so a mixed search shows both, best matches first.
function interleave(lists: BaseChannel[][]) {
  const longest = Math.max(0, ...lists.map((list) => list.length))
  return Array.from({ length: longest }, (_, index) =>
    lists.flatMap((list) => (index < list.length ? [list[index]] : []))
  ).flat()
}

export async function getSearchResults(
  query: string,
  platform: PlatformFilter = "all"
): Promise<SearchPayload> {
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

  const platforms = configuredPlatforms().filter(
    (candidate) => platform === "all" || candidate === platform
  )
  const searches = (
    await Promise.all(platforms.map((candidate) => searchPlatform(candidate, normalizedQuery)))
  ).filter((search) => search !== null)

  if (searches.length === 0) {
    return { query: normalizedQuery, channels: [], cached: false, source: "search" }
  }

  // The result limit is shared across platforms, not per platform.
  const channels = interleave(searches.map((search) => search.channels)).slice(
    0,
    SEARCH_RESULT_LIMIT
  )

  await updateSeedChannels(channels)

  return {
    query: normalizedQuery,
    channels: await withLiveStatus(channels),
    cached: searches.every((search) => search.cached),
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

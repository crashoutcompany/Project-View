import type { Platform } from "@/lib/types"

export const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 12
export const CHANNEL_CACHE_TTL_SECONDS = 60 * 60 * 24
export const LIVE_CACHE_TTL_LIVE_SECONDS = 60
export const LIVE_CACHE_TTL_OFFLINE_SECONDS = 60 * 10
export const SEED_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
// Shared across platforms: a mixed search returns at most this many channels.
export const SEARCH_RESULT_LIMIT = 5
export const SEEDED_CHANNEL_LIMIT = 8

// Inputs come from public URLs and server actions, and each uncached channel
// id or query costs YouTube quota or a Twitch call, so bound them. The cap
// covers both platforms combined.
export const MAX_SELECTED_CHANNELS = 50
export const MAX_QUERY_LENGTH = 100

export const TWITCH_ID_PREFIX = "tw:"
export const YOUTUBE_ID_PREFIX = "yt:"
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const TWITCH_USER_ID_PATTERN = /^\d{1,20}$/

export type ParsedChannelId = {
  platform: Platform
  // Platform-native id: the YouTube channel id or the Twitch user id.
  id: string
  // Canonical app id: bare for YouTube (so old URLs and caches keep working),
  // "tw:"-prefixed for Twitch.
  channelId: string
}

/** Accepts "tw:<user id>", "yt:<channel id>" or a bare (legacy) YouTube id. */
export function parseChannelId(raw: unknown): ParsedChannelId | null {
  if (typeof raw !== "string") {
    return null
  }

  if (raw.startsWith(TWITCH_ID_PREFIX)) {
    const id = raw.slice(TWITCH_ID_PREFIX.length)
    return TWITCH_USER_ID_PATTERN.test(id)
      ? { platform: "twitch", id, channelId: raw }
      : null
  }

  const id = raw.startsWith(YOUTUBE_ID_PREFIX) ? raw.slice(YOUTUBE_ID_PREFIX.length) : raw
  return YOUTUBE_ID_PATTERN.test(id) ? { platform: "youtube", id, channelId: id } : null
}

export function twitchChannelId(userId: string) {
  return `${TWITCH_ID_PREFIX}${userId}`
}

export function platformOf(channelId: string): Platform {
  return channelId.startsWith(TWITCH_ID_PREFIX) ? "twitch" : "youtube"
}

export function isValidChannelId(id: unknown): id is string {
  return parseChannelId(id) !== null
}

/**
 * Canonicalizes, dedupes, drops malformed ids, and caps the list (for
 * URL-supplied ids). The cap applies across both platforms.
 */
export function sanitizeChannelIds(ids: readonly unknown[]): string[] {
  const channelIds = ids
    .map((id) => parseChannelId(id)?.channelId)
    .filter((id): id is string => Boolean(id))

  return Array.from(new Set(channelIds)).slice(0, MAX_SELECTED_CHANNELS)
}

export function normalizeQuery(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH)
}

export function searchCacheKey(query: string, platform: Platform = "youtube") {
  return platform === "twitch"
    ? `tw:search:v1:${normalizeQuery(query)}`
    : `yt:search:v1:${normalizeQuery(query)}`
}

// YouTube keys are unchanged so existing cache entries stay valid.
export function channelCacheKey(channelId: string) {
  return platformOf(channelId) === "twitch"
    ? `tw:channel:v1:${channelId.slice(TWITCH_ID_PREFIX.length)}`
    : `yt:channel:v1:${channelId}`
}

export function liveCacheKey(channelId: string) {
  return platformOf(channelId) === "twitch"
    ? `tw:live:v1:${channelId.slice(TWITCH_ID_PREFIX.length)}`
    : `yt:live:v1:${channelId}`
}

// Mixed-platform list; entries cached before Twitch have no platform field.
export const seedCacheKey = "yt:seed:v1"

export const twitchTokenCacheKey = "tw:token:v1"

export const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 12
export const CHANNEL_CACHE_TTL_SECONDS = 60 * 60 * 24
export const LIVE_CACHE_TTL_LIVE_SECONDS = 60
export const LIVE_CACHE_TTL_OFFLINE_SECONDS = 60 * 10
export const SEED_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
export const SEARCH_RESULT_LIMIT = 5
export const SEEDED_CHANNEL_LIMIT = 8

// Inputs come from public URLs and server actions, and each uncached channel
// id or query costs YouTube quota, so bound them.
export const MAX_SELECTED_CHANNELS = 50
export const MAX_QUERY_LENGTH = 100
const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export function isValidChannelId(id: unknown): id is string {
  return typeof id === "string" && CHANNEL_ID_PATTERN.test(id)
}

/** Dedupes, drops malformed ids, and caps the list (for URL-supplied ids). */
export function sanitizeChannelIds(ids: readonly unknown[]): string[] {
  return Array.from(new Set(ids.filter(isValidChannelId))).slice(0, MAX_SELECTED_CHANNELS)
}

export function normalizeQuery(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_QUERY_LENGTH)
}

export function searchCacheKey(query: string) {
  return `yt:search:v1:${normalizeQuery(query)}`
}

export function channelCacheKey(channelId: string) {
  return `yt:channel:v1:${channelId}`
}

export function liveCacheKey(channelId: string) {
  return `yt:live:v1:${channelId}`
}

export const seedCacheKey = "yt:seed:v1"

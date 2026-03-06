export const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 12
export const CHANNEL_CACHE_TTL_SECONDS = 60 * 60 * 24
export const LIVE_CACHE_TTL_LIVE_SECONDS = 60
export const LIVE_CACHE_TTL_OFFLINE_SECONDS = 60 * 10
export const SEED_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7
export const SEARCH_RESULT_LIMIT = 5
export const SEEDED_CHANNEL_LIMIT = 8

export function normalizeQuery(input: string) {
  return input.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, " ")
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
